import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { CameraPreset } from '@/lib/types';

const READING_FOV = 30;
const TOP_FOV = 12;
const READING_TILT = THREE.MathUtils.degToRad(20);
const RESERVED_TOP = 64;
const RESERVED_BOTTOM = 112;
const SIDE_MARGIN = 0.07;
const TWEEN_MS = 450;

interface Pose {
  radius: number;
  phi: number;
  theta: number;
  fov: number;
  target: THREE.Vector3;
}

function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(READING_FOV, 1, 5, 20000);
  readonly controls: OrbitControls;
  preset: CameraPreset | 'free' = 'reading';

  private viewportWidth = 1;
  private viewportHeight = 1;
  private contentWidth = 420;
  private contentHeight = 297;
  private contentZ = 0;
  private readonly spherical = new THREE.Spherical();
  private readonly offset = new THREE.Vector3();
  private tween: { from: Pose; to: Pose; start: number; duration: number } | null = null;
  private readonly handleChange: () => void;

  constructor(
    element: HTMLElement,
    private readonly onChange: () => void,
    private readonly onPreset: (preset: CameraPreset | 'free') => void,
  ) {
    this.controls = new OrbitControls(this.camera, element);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI - 0.12;
    this.handleChange = () => {
      this.detectFreeOrbit();
      this.onChange();
    };
    this.controls.addEventListener('change', this.handleChange);
    this.applyButtons();
    this.snapTo(this.poseFor('reading'));
  }

  get animating(): boolean {
    return this.tween !== null;
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.camera.aspect = this.viewportWidth / this.viewportHeight;
    this.camera.updateProjectionMatrix();
  }

  setContent(width: number, height: number, z: number): void {
    this.contentWidth = width;
    this.contentHeight = height;
    this.contentZ = z;
  }

  applyPreset(preset: CameraPreset, animate: boolean): void {
    this.preset = preset;
    this.applyButtons();
    this.moveTo(this.poseFor(preset), animate ? TWEEN_MS : 0);
    this.onPreset(preset);
  }

  reframe(animate: boolean): void {
    if (this.preset === 'free') {
      this.updateLimits(this.fitDistance(this.camera.fov));
      return;
    }
    this.moveTo(this.poseFor(this.preset), animate ? TWEEN_MS : 0);
  }

  zoomBy(factor: number, animate: boolean): void {
    const pose = this.currentPose();
    pose.radius = THREE.MathUtils.clamp(pose.radius / factor, this.controls.minDistance, this.controls.maxDistance);
    this.moveTo(pose, animate ? 180 : 0);
  }

  update(now: number): boolean {
    if (this.tween) {
      const { from, to, start, duration } = this.tween;
      const u = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      const e = easeInOutCubic(u);
      this.applyPose({
        radius: THREE.MathUtils.lerp(from.radius, to.radius, e),
        phi: THREE.MathUtils.lerp(from.phi, to.phi, e),
        theta: THREE.MathUtils.lerp(from.theta, to.theta, e),
        fov: THREE.MathUtils.lerp(from.fov, to.fov, e),
        target: from.target.clone().lerp(to.target, e),
      });
      if (u >= 1) {
        this.tween = null;
        this.controls.enabled = true;
      }
      return true;
    }
    return this.controls.update();
  }

  dispose(): void {
    this.controls.removeEventListener('change', this.handleChange);
    this.controls.dispose();
  }

  private fitDistance(fov: number): number {
    const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const freeHeight = Math.max(120, this.viewportHeight - RESERVED_TOP - RESERVED_BOTTOM);
    const freeWidth = Math.max(120, this.viewportWidth * (1 - SIDE_MARGIN * 2));
    const byHeight = (this.contentHeight / 2 / tan) * (this.viewportHeight / freeHeight);
    const byWidth = (this.contentWidth / 2 / (tan * this.camera.aspect)) * (this.viewportWidth / freeWidth);
    return Math.max(byHeight, byWidth);
  }

  private poseFor(preset: CameraPreset): Pose {
    const fov = preset === 'top' ? TOP_FOV : READING_FOV;
    const radius = this.fitDistance(fov);
    this.updateLimits(radius);
    const worldPerPixel = (2 * radius * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / this.viewportHeight;
    const shift = ((RESERVED_BOTTOM - RESERVED_TOP) / 2) * worldPerPixel;
    return {
      radius,
      phi: Math.PI / 2 + (preset === 'top' ? 0 : READING_TILT),
      theta: 0,
      fov,
      target: new THREE.Vector3(0, -shift, this.contentZ),
    };
  }

  private updateLimits(fitRadius: number): void {
    this.controls.minDistance = fitRadius * 0.12;
    this.controls.maxDistance = fitRadius * 3.2;
    const near = Math.max(1, fitRadius * 0.04);
    const far = fitRadius * 8;
    if (this.camera.near !== near || this.camera.far !== far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  private currentPose(): Pose {
    this.offset.copy(this.camera.position).sub(this.controls.target);
    this.spherical.setFromVector3(this.offset);
    return {
      radius: this.spherical.radius,
      phi: this.spherical.phi,
      theta: this.spherical.theta,
      fov: this.camera.fov,
      target: this.controls.target.clone(),
    };
  }

  private applyPose(pose: Pose): void {
    this.spherical.set(pose.radius, pose.phi, pose.theta);
    this.offset.setFromSpherical(this.spherical);
    this.controls.target.copy(pose.target);
    this.camera.position.copy(pose.target).add(this.offset);
    if (this.camera.fov !== pose.fov) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(pose.target);
    this.onChange();
  }

  private snapTo(pose: Pose): void {
    this.tween = null;
    this.applyPose(pose);
    this.controls.enabled = true;
    this.controls.update();
  }

  private moveTo(pose: Pose, duration: number): void {
    if (duration <= 0) {
      this.snapTo(pose);
      return;
    }
    const from = this.currentPose();
    let delta = pose.theta - from.theta;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.tween = { from, to: { ...pose, theta: from.theta + delta }, start: performance.now(), duration };
    this.controls.enabled = false;
    this.onChange();
  }

  private applyButtons(): void {
    const inspecting = this.preset === 'top';
    this.controls.mouseButtons = {
      LEFT: inspecting ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: inspecting ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: inspecting ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
  }

  private detectFreeOrbit(): void {
    if (this.tween || this.preset === 'free') return;
    const expectedPhi = Math.PI / 2 + (this.preset === 'top' ? 0 : READING_TILT);
    this.offset.copy(this.camera.position).sub(this.controls.target);
    this.spherical.setFromVector3(this.offset);
    if (Math.abs(this.spherical.phi - expectedPhi) > 0.02 || Math.abs(this.spherical.theta) > 0.02) {
      this.preset = 'free';
      this.applyButtons();
      this.onPreset('free');
    }
  }
}
