import * as THREE from 'https://cdn.skypack.dev/three@0.136';

import {FirstPersonControls} from 'https://cdn.skypack.dev/three@0.136/examples/jsm/controls/FirstPersonControls.js';


const KEYS = {
  'a': 65,
  's': 83,
  'w': 87,
  'd': 68,
};

function clamp(x, a, b) {
  return Math.min(Math.max(x, a), b);
}

class InputController {
  constructor(target) {
    this.target_ = target || document;
    this.initialize_();    
  }

  initialize_() {
    this.current_ = {
      leftButton: false,
      rightButton: false,
      mouseXDelta: 0,
      mouseYDelta: 0,
      mouseX: 0,
      mouseY: 0,
    };
    this.previous_ = null;
    this.keys_ = {};
    this.previousKeys_ = {};
    this.target_.addEventListener('mousedown', (e) => this.onMouseDown_(e), false);
    this.target_.addEventListener('mousemove', (e) => this.onMouseMove_(e), false);
    this.target_.addEventListener('mouseup', (e) => this.onMouseUp_(e), false);
    this.target_.addEventListener('keydown', (e) => this.onKeyDown_(e), false);
    this.target_.addEventListener('keyup', (e) => this.onKeyUp_(e), false);
  }

  onMouseMove_(e) {
    this.current_.mouseX = e.pageX - window.innerWidth / 2;
    this.current_.mouseY = e.pageY - window.innerHeight / 2;

    if (this.previous_ === null) {
      this.previous_ = {...this.current_};
    }

    this.current_.mouseXDelta = this.current_.mouseX - this.previous_.mouseX;
    this.current_.mouseYDelta = this.current_.mouseY - this.previous_.mouseY;
  }

  onMouseDown_(e) {
    this.onMouseMove_(e);

    switch (e.button) {
      case 0: {
        this.current_.leftButton = true;
        break;
      }
      case 2: {
        this.current_.rightButton = true;
        break;
      }
    }
  }

  onMouseUp_(e) {
    this.onMouseMove_(e);

    switch (e.button) {
      case 0: {
        this.current_.leftButton = false;
        break;
      }
      case 2: {
        this.current_.rightButton = false;
        break;
      }
    }
  }

  onKeyDown_(e) {
    this.keys_[e.keyCode] = true;
  }

  onKeyUp_(e) {
    this.keys_[e.keyCode] = false;
  }

  key(keyCode) {
    return !!this.keys_[keyCode];
  }

  isReady() {
    return this.previous_ !== null;
  }

  update(_) {
    if (this.previous_ !== null) {
      this.current_.mouseXDelta = this.current_.mouseX - this.previous_.mouseX;
      this.current_.mouseYDelta = this.current_.mouseY - this.previous_.mouseY;

      this.previous_ = {...this.current_};
    }
  }
};


class FirstPersonCamera {
  constructor(camera, objects) {
    this.camera_ = camera;
    this.input_ = new InputController();
    this.rotation_ = new THREE.Quaternion();
    this.translation_ = new THREE.Vector3(-45, 2, 0); // Initial position
    this.phi_ = 0;
    this.phiSpeed_ = 8;
    this.theta_ = 0;
    this.thetaSpeed_ = 5;
    this.headBobActive_ = false;
    this.headBobTimer_ = 0;
    this.objects_ = objects;
    this.collisionBoxSize_ = new THREE.Vector3(3, 2, 3); // Define the size of the player's collision box

    this.winningZone_ = new THREE.Vector3(45, 2, 0); // Winning zone coordinates
    this.winningZoneRadius_ = 2; // Radius around the winning zone coordinates
    this.hasWon_ = false; // To prevent multiple notifications
  }

  update(timeElapsedS) {
    this.updateRotation_(timeElapsedS);
    this.updateCamera_(timeElapsedS);
    this.updateTranslation_(timeElapsedS);
    this.updateHeadBob_(timeElapsedS);
    this.input_.update(timeElapsedS);
  }

  updateCamera_(_) {
    this.camera_.quaternion.copy(this.rotation_);
    this.camera_.position.copy(this.translation_);
    this.camera_.position.y += Math.sin(this.headBobTimer_ * 10) * 1.5;

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.rotation_);

    const dir = forward.clone();

    forward.multiplyScalar(100);
    forward.add(this.translation_);

    let closest = forward;
    const result = new THREE.Vector3();
    const ray = new THREE.Ray(this.translation_, dir);
    for (let i = 0; i < this.objects_.length; ++i) {
      if (ray.intersectBox(this.objects_[i], result)) {
        if (result.distanceTo(ray.origin) < closest.distanceTo(ray.origin)) {
          closest = result.clone();
        }
      }
    }

    this.camera_.lookAt(closest);
  }

  updateHeadBob_(timeElapsedS) {
    if (this.headBobActive_) {
      const wavelength = Math.PI;
      const nextStep = 1 + Math.floor(((this.headBobTimer_ + 0.000001) * 5) / wavelength);
      const nextStepTime = nextStep * wavelength / 10;
      this.headBobTimer_ = Math.min(this.headBobTimer_ + timeElapsedS, nextStepTime);

      if (this.headBobTimer_ == nextStepTime) {
        this.headBobActive_ = false;
      }
    }
  }

  updateTranslation_(timeElapsedS) {
    const forwardVelocity = (this.input_.key(KEYS.w) ? 1 : 0) + (this.input_.key(KEYS.s) ? -1 : 0);
    const strafeVelocity = (this.input_.key(KEYS.a) ? 1 : 0) + (this.input_.key(KEYS.d) ? -1 : 0);

    const qx = new THREE.Quaternion();
    qx.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.phi_);

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(qx);
    forward.multiplyScalar(forwardVelocity * timeElapsedS * 10);

    const left = new THREE.Vector3(-1, 0, 0);
    left.applyQuaternion(qx);
    left.multiplyScalar(strafeVelocity * timeElapsedS * 10);

    const newPosition = this.translation_.clone();
    newPosition.add(forward);
    newPosition.add(left);

    // Perform collision detection
    if (!this.detectCollision_(newPosition)) {
      this.translation_.copy(newPosition); // Update position only if no collision
    }

    if (forwardVelocity != 0 || strafeVelocity != 0) {
      this.headBobActive_ = true;
    }

    this.checkWinningZone_();
  }

  checkWinningZone_() {
    if (this.translation_.distanceTo(this.winningZone_) <= this.winningZoneRadius_) {
      if (!this.hasWon_) {
        this.displayWinningNotification_();
        this.hasWon_ = true;
      }
    }
  }

  displayWinningNotification_() {
    alert('Congratulations! You have reached the winning zone!');
    window.location.reload();
  }

  detectCollision_(newPosition) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      newPosition.clone().add(new THREE.Vector3(0, this.collisionBoxSize_.y / 2, 0)),
      this.collisionBoxSize_
    );

    for (let i = 0; i < this.objects_.length; ++i) {
      if (playerBox.intersectsBox(this.objects_[i])) {
        return true; // Collision detected
      }
    }

    return false; // No collision
  }

  updateRotation_(timeElapsedS) {
    const xh = this.input_.current_.mouseXDelta * 3 / window.innerWidth;
    const yh = this.input_.current_.mouseYDelta * 3 / window.innerHeight;

    this.phi_ += -xh * this.phiSpeed_;
    this.theta_ = clamp(this.theta_ + -yh * this.thetaSpeed_, -Math.PI / 3, Math.PI / 3);

    const qx = new THREE.Quaternion();
    qx.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.phi_);
    const qz = new THREE.Quaternion();
    qz.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.theta_);

    const q = new THREE.Quaternion();
    q.multiply(qx);
    q.multiply(qz);

    this.rotation_.copy(q);
  }
}


class FirstPersonCameraDemo {
  constructor() {
    this.initialize_();
  }

  initialize_() {
    alert("Find a yellow box in the maze to win!");
    alert("Use WASD to move around the maze.");
    this.initializeRenderer_();
    this.initializeLights_();
    this.initializeScene_();
    this.initializePostFX_();
    this.initializeDemo_();

    this.previousRAF_ = null;
    this.raf_();
    this.onWindowResize_();
  }

  initializeDemo_() {
    // this.controls_ = new FirstPersonControls(
    //     this.camera_, this.threejs_.domElement);
    // this.controls_.lookSpeed = 0.8;
    // this.controls_.movementSpeed = 5;

    this.fpsCamera_ = new FirstPersonCamera(this.camera_, this.objects_);
  }

  initializeRenderer_() {
    this.threejs_ = new THREE.WebGLRenderer({
      antialias: false,
    });
    this.threejs_.shadowMap.enabled = true;
    this.threejs_.shadowMap.type = THREE.PCFSoftShadowMap;
    this.threejs_.setPixelRatio(window.devicePixelRatio);
    this.threejs_.setSize(window.innerWidth, window.innerHeight);
    this.threejs_.physicallyCorrectLights = true;
    this.threejs_.outputEncoding = THREE.sRGBEncoding;

    document.body.appendChild(this.threejs_.domElement);

    window.addEventListener('resize', () => {
      this.onWindowResize_();
    }, false);

    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 1000.0;
    this.camera_ = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera_.position.set(0, 2, 0);

    this.scene_ = new THREE.Scene();

    this.uiCamera_ = new THREE.OrthographicCamera(
        -1, 1, 1 * aspect, -1 * aspect, 1, 1000);
    this.uiScene_ = new THREE.Scene();
  }

  initializeScene_() {
    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
      './resources/skybox/image.jpg',
      './resources/skybox/negx.jpg',
      './resources/skybox/posy.jpg',
      './resources/skybox/negy.jpg',
      './resources/skybox/posz.jpg',
      './resources/skybox/negz.jpg',
  ]);

    texture.encoding = THREE.sRGBEncoding;
    this.scene_.background = texture;

    const mapLoader = new THREE.TextureLoader();
    const maxAnisotropy = this.threejs_.capabilities.getMaxAnisotropy();
    const checkerboard = mapLoader.load('resources/checkerboard.png');
    checkerboard.anisotropy = maxAnisotropy;
    checkerboard.wrapS = THREE.RepeatWrapping;
    checkerboard.wrapT = THREE.RepeatWrapping;
    checkerboard.repeat.set(32, 32);
    checkerboard.encoding = THREE.sRGBEncoding;

    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100, 10, 10),
        new THREE.MeshStandardMaterial({map: checkerboard}));
    plane.castShadow = false;
    plane.receiveShadow = true;
    plane.rotation.x = -Math.PI / 2;
    this.scene_.add(plane);

    const concreteMaterial = this.loadMaterial_('concrete3-', 4);

    const wall1 = new THREE.Mesh(
      new THREE.BoxGeometry(100, 100, 4),
      concreteMaterial);
    wall1.position.set(0, -40, -50);
    wall1.castShadow = true;
    wall1.receiveShadow = true;
    this.scene_.add(wall1);

    const wall2 = new THREE.Mesh(
      new THREE.BoxGeometry(100, 100, 4),
      concreteMaterial);
    wall2.position.set(0, -40, 50);
    wall2.castShadow = true;
    wall2.receiveShadow = true;
    this.scene_.add(wall2);

    const wall3 = new THREE.Mesh(
      new THREE.BoxGeometry(4, 100, 100),
      concreteMaterial);
    wall3.position.set(50, -40, 0);
    wall3.castShadow = true;
    wall3.receiveShadow = true;
    this.scene_.add(wall3);

    const wall4 = new THREE.Mesh(
      new THREE.BoxGeometry(4, 100, 100),
      concreteMaterial);
    wall4.position.set(-50, -40, 0);
    wall4.castShadow = true;
    wall4.receiveShadow = true;
    this.scene_.add(wall4);

    //Win zone Create
    const boxWin = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      this.loadMaterial_('yellow_', 0.2));
    boxWin.position.set(45, 2, 0);
    boxWin.castShadow = true;
    boxWin.receiveShadow = true;
    this.scene_.add(boxWin);

    //Box Create
    const box1 = new THREE.Mesh(
      new THREE.BoxGeometry(2, 10, 58),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box1.position.set(-23, 5, 7);
    box1.castShadow = true;
    box1.receiveShadow = true;
    this.scene_.add(box1);

    const box2 = new THREE.Mesh(
      new THREE.BoxGeometry(86, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box2.position.set(8, 5, 35);
    box2.castShadow = true;
    box2.receiveShadow = true;
    this.scene_.add(box2);

    const box3 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box3.position.set(-32, 5, 7);
    box3.castShadow = true;
    box3.receiveShadow = true;
    this.scene_.add(box3);

    const box4 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box4.position.set(-42, 5, 21);
    box4.castShadow = true;
    box4.receiveShadow = true;
    this.scene_.add(box4);

    const box5 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box5.position.set(-42, 5, -7);
    box5.castShadow = true;
    box5.receiveShadow = true;
    this.scene_.add(box5);

    const box6 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box6.position.set(-42, 5, -36);
    box6.castShadow = true;
    box6.receiveShadow = true;
    this.scene_.add(box6);

    const box7 = new THREE.Mesh(
      new THREE.BoxGeometry(43, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box7.position.set(14, 5, 21);
    box7.castShadow = true;
    box7.receiveShadow = true;
    this.scene_.add(box7);

    const box8 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box8.position.set(1, 5, 7);
    box8.castShadow = true;
    box8.receiveShadow = true;
    this.scene_.add(box8);

    const box9 = new THREE.Mesh(
      new THREE.BoxGeometry(32, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box9.position.set(18, 5, -36);
    box9.castShadow = true;
    box9.receiveShadow = true;
    this.scene_.add(box9);

    const box10 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box10.position.set(42, 5, -22);
    box10.castShadow = true;
    box10.receiveShadow = true;
    this.scene_.add(box10);

    const box11 = new THREE.Mesh(
      new THREE.BoxGeometry(32, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box11.position.set(34, 5, -7);
    box11.castShadow = true;
    box11.receiveShadow = true;
    this.scene_.add(box11);

    const box12 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box12.position.set(42, 5, 7);
    box12.castShadow = true;
    box12.receiveShadow = true;
    this.scene_.add(box12);

    const box13 = new THREE.Mesh(
      new THREE.BoxGeometry(2, 10, 32),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box13.position.set(19, 5, -9);
    box13.castShadow = true;
    box13.receiveShadow = true;
    this.scene_.add(box13);

    const box14 = new THREE.Mesh(
      new THREE.BoxGeometry(2, 10, 44),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box14.position.set(3, 5, -28);
    box14.castShadow = true;
    box14.receiveShadow = true;
    this.scene_.add(box14);

    const box15 = new THREE.Mesh(
      new THREE.BoxGeometry(2, 10, 44),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box15.position.set(-8, 5, 0);
    box15.castShadow = true;
    box15.receiveShadow = true;
    this.scene_.add(box15);

    const box16 = new THREE.Mesh(
      new THREE.BoxGeometry(2, 10, 16),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box16.position.set(-8, 5, -42);
    box16.castShadow = true;
    box16.receiveShadow = true;
    this.scene_.add(box16);

    const box17 = new THREE.Mesh(
      new THREE.BoxGeometry(2, 10, 16),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box17.position.set(35, 5, 28);
    box17.castShadow = true;
    box17.receiveShadow = true;
    this.scene_.add(box17);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(16, 10, 2),
      this.loadMaterial_('vintage-tile1_', 0.2));
    box.position.set(-32, 5, -21);
    box.castShadow = true;
    box.receiveShadow = true;
    this.scene_.add(box);

    // Create Box3 for each mesh in the scene so that we can
    // do some easy intersection tests.
    const meshes = [
      plane, box, box1, box2, box3, box4, box5, box6, box7, box8, box9, box10, box11, box12, box13, box14, box15, box16, box17, wall1, wall2, wall3, wall4];

    this.objects_ = [];

    for (let i = 0; i < meshes.length; ++i) {
      const b = new THREE.Box3();
      b.setFromObject(meshes[i]);
      this.objects_.push(b);
    }

    // Crosshair
    const crosshair = mapLoader.load('resources/crosshair.png');
    crosshair.anisotropy = maxAnisotropy;

    this.sprite_ = new THREE.Sprite(
      new THREE.SpriteMaterial({map: crosshair, color: 0xffffff, fog: false, depthTest: false, depthWrite: false}));
    this.sprite_.scale.set(0.15, 0.15 * this.camera_.aspect, 1)
    this.sprite_.position.set(0, 0, -10);

    this.uiScene_.add(this.sprite_);
  }

  initializeLights_() {
    const distance = 50.0;
    const angle = Math.PI / 4.0;
    const penumbra = 0.5;
    const decay = 1.0;

    let light = new THREE.SpotLight(
        0xFFFFFF, 100.0, distance, angle, penumbra, decay);
    light.castShadow = true;
    light.shadow.bias = -0.00001;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 100;

    light.position.set(25, 25, 0);
    light.lookAt(0, 0, 0);
    this.scene_.add(light);

    const upColour = 0xFFFF80;
    const downColour = 0x808080;
    light = new THREE.HemisphereLight(upColour, downColour, 0.5);
    light.color.setHSL( 0.6, 1, 0.6 );
    light.groundColor.setHSL( 0.095, 1, 0.75 );
    light.position.set(0, 4, 0);
    this.scene_.add(light);
  }

  loadMaterial_(name, tiling) {
    const mapLoader = new THREE.TextureLoader();
    const maxAnisotropy = this.threejs_.capabilities.getMaxAnisotropy();
  
    const metalMap = mapLoader.load('resources/freepbr/' + name + 'metallic.png');
    metalMap.anisotropy = maxAnisotropy;
    metalMap.wrapS = THREE.RepeatWrapping;
    metalMap.wrapT = THREE.RepeatWrapping;
    metalMap.repeat.set(tiling, tiling);
  
    const albedo = mapLoader.load('resources/freepbr/' + name + 'albedo.png');
    albedo.anisotropy = maxAnisotropy;
    albedo.wrapS = THREE.RepeatWrapping;
    albedo.wrapT = THREE.RepeatWrapping;
    albedo.repeat.set(tiling, tiling);
    albedo.encoding = THREE.sRGBEncoding;
  
    const normalMap = mapLoader.load('resources/freepbr/' + name + 'normal.png');
    normalMap.anisotropy = maxAnisotropy;
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(tiling, tiling);
  
    const roughnessMap = mapLoader.load('resources/freepbr/' + name + 'roughness.png');
    roughnessMap.anisotropy = maxAnisotropy;
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.set(tiling, tiling);
  
    // Custom Shader
    const vertexShader = `
      varying vec3 vPosition;
      varying vec2 vUv;
      
      void main() {
        vPosition = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
  
    const fragmentShader = `
      varying vec3 vPosition;
      varying vec2 vUv;
  
      uniform sampler2D map;
      uniform sampler2D normalMap;
      uniform sampler2D roughnessMap;
  
      void main() {
        vec4 albedoColor = texture2D(map, vUv);
        vec4 normalColor = texture2D(normalMap, vUv);
        vec4 roughnessColor = texture2D(roughnessMap, vUv);
  
        // Combine textures in a simple way for the sake of this example
        vec4 finalColor = albedoColor * 0.8 + normalColor * 0.1 + roughnessColor * 0.1;
        gl_FragColor = finalColor;
      }
    `;
  
    const shaderMaterial = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        map: { value: albedo },
        normalMap: { value: normalMap },
        roughnessMap: { value: roughnessMap },
      }
    });
  
    return shaderMaterial;
  }
  

  initializePostFX_() {
  }

  onWindowResize_() {
    this.camera_.aspect = window.innerWidth / window.innerHeight;
    this.camera_.updateProjectionMatrix();

    this.uiCamera_.left = -this.camera_.aspect;
    this.uiCamera_.right = this.camera_.aspect;
    this.uiCamera_.updateProjectionMatrix();

    this.threejs_.setSize(window.innerWidth, window.innerHeight);
  }

  raf_() {
    requestAnimationFrame((t) => {
      if (this.previousRAF_ === null) {
        this.previousRAF_ = t;
      }

      this.step_(t - this.previousRAF_);
      this.threejs_.autoClear = true;
      this.threejs_.render(this.scene_, this.camera_);
      this.threejs_.autoClear = false;
      this.threejs_.render(this.uiScene_, this.uiCamera_);
      this.previousRAF_ = t;
      this.raf_();
    });
  }

  step_(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;

    // this.controls_.update(timeElapsedS);
    this.fpsCamera_.update(timeElapsedS);
  }
}


let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new FirstPersonCameraDemo();
});
