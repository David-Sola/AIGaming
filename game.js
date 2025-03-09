// Import necessary libraries
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import GameState from './gameState.js';
import NetworkManager from './network.js';
import { PhysicsWorld, Vehicle } from './physics.js';
import { VehicleVisual } from './vehicleVisual.js';

// Initialize game state and network manager
const gameState = new GameState();
const networkManager = new NetworkManager(gameState);

// Game state
let gameStarted = false;
let currentTrack = null;
let physicsWorld = null;
let vehicle = null;
let vehicleVisual = null;
let lastTime = performance.now();

// Track definitions
const tracks = {
    straight: {
        name: "Straight Track",
        description: "A simple straight track with a start and finish line",
        create: createStraightTrack,
        bounds: {
            left: -5,
            right: 5,
            top: -24.5,
            bottom: 24.5
        },
        startPosition: new THREE.Vector3(0, 0.5, 22),
        startRotation: 0
    },
    circle: {
        name: "Giant Circle Track",
        description: "A massive circular track with separate start and finish lines",
        create: createCircleTrack,
        bounds: {
            centerX: 0,
            centerZ: 0,
            innerRadius: 300,
            outerRadius: 315
        },
        startPosition: new THREE.Vector3(0, 0.5, 0),
        startRotation: 0
    }
};

// Track keyboard input
const keys = { 
    ArrowUp: false, 
    ArrowDown: false, 
    ArrowLeft: false, 
    ArrowRight: false, 
    KeyW: false, 
    KeyS: false, 
    KeyA: false, 
    KeyD: false,
    KeyR: false, // Reset key
    Space: false // Emergency brake
};

// Set up key event listeners
window.addEventListener('keydown', (e) => { 
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true; 
});
window.addEventListener('keyup', (e) => { 
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false; 
});

// Set up the scene, camera, and renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue background

// Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 10);
scene.add(directionalLight);

// Create a perspective camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

// Track objects container
const trackObjects = {
    track: null,
    startLine: null,
    finishLine: null,
    boundaries: [],
    barriers: []
};

// Global reference to the menu container
let menuContainer;

// Functions to create tracks
function createStraightTrack() {
    // Clear any existing track objects
    clearTrack();
    
    // Create a straight track
    const trackGeometry = new THREE.PlaneGeometry(10, 50);
    trackObjects.track = new THREE.Mesh(trackGeometry, new THREE.MeshPhongMaterial({ color: 0x888888 }));
    trackObjects.track.rotation.x = -Math.PI / 2;
    trackObjects.track.receiveShadow = true;
    scene.add(trackObjects.track);
    
    // Add track to physics world
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
        mass: 0,
        shape: groundShape,
        material: physicsWorld.groundMaterial
    });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    physicsWorld.world.addBody(groundBody);
    
    // Create start line
    const startGeometry = new THREE.PlaneGeometry(10, 1);
    trackObjects.startLine = new THREE.Mesh(startGeometry, new THREE.MeshPhongMaterial({ color: 0x00ff00 }));
    trackObjects.startLine.rotation.x = -Math.PI / 2;
    trackObjects.startLine.position.z = 24;
    trackObjects.startLine.position.y = 0.01;
    scene.add(trackObjects.startLine);
    
    // Create finish line
    const finishGeometry = new THREE.PlaneGeometry(10, 1);
    trackObjects.finishLine = new THREE.Mesh(finishGeometry, new THREE.MeshPhongMaterial({ color: 0xff0000 }));
    trackObjects.finishLine.rotation.x = -Math.PI / 2;
    trackObjects.finishLine.position.z = -24;
    trackObjects.finishLine.position.y = 0.01;
    scene.add(trackObjects.finishLine);
    
    // Add barriers
    const barrierGeometry = new THREE.BoxGeometry(0.5, 2, 50);
    const barrierMaterial = new THREE.MeshPhongMaterial({ color: 0x993300 });
    
    // Left barrier
    const leftBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
    leftBarrier.position.set(-5.25, 1, 0);
    scene.add(leftBarrier);
    trackObjects.barriers.push(leftBarrier);
    
    // Right barrier
    const rightBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
    rightBarrier.position.set(5.25, 1, 0);
    scene.add(rightBarrier);
    trackObjects.barriers.push(rightBarrier);
    
    // Add barrier physics
    const barrierShape = new CANNON.Box(new CANNON.Vec3(0.25, 1, 25));
    
    // Left barrier physics
    const leftBarrierBody = new CANNON.Body({
        mass: 0,
        shape: barrierShape,
        position: new CANNON.Vec3(-5.25, 1, 0)
    });
    physicsWorld.world.addBody(leftBarrierBody);
    
    // Right barrier physics
    const rightBarrierBody = new CANNON.Body({
        mass: 0,
        shape: barrierShape,
        position: new CANNON.Vec3(5.25, 1, 0)
    });
    physicsWorld.world.addBody(rightBarrierBody);
}

function createCircleTrack() {
    // Clear any existing track objects
    clearTrack();
    
    // Track parameters
    const innerRadius = tracks.circle.bounds.innerRadius;
    const outerRadius = tracks.circle.bounds.outerRadius;
    const segments = 128;
    
    // Create a circular track
    const trackGeometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
    trackObjects.track = new THREE.Mesh(trackGeometry, new THREE.MeshPhongMaterial({ color: 0x888888 }));
    trackObjects.track.rotation.x = -Math.PI / 2;
    trackObjects.track.receiveShadow = true;
    scene.add(trackObjects.track);
    
    // Add track to physics world - approximate with segments
    const trackSegments = 32; // Fewer segments for physics performance
    const segmentAngle = (2 * Math.PI) / trackSegments;
    
    for (let i = 0; i < trackSegments; i++) {
        const angle = i * segmentAngle;
        const nextAngle = (i + 1) * segmentAngle;
        
        // Create segment vertices
        const innerStart = new CANNON.Vec3(
            innerRadius * Math.cos(angle),
            0,
            innerRadius * Math.sin(angle)
        );
        const outerStart = new CANNON.Vec3(
            outerRadius * Math.cos(angle),
            0,
            outerRadius * Math.sin(angle)
        );
        const innerEnd = new CANNON.Vec3(
            innerRadius * Math.cos(nextAngle),
            0,
            innerRadius * Math.sin(nextAngle)
        );
        const outerEnd = new CANNON.Vec3(
            outerRadius * Math.cos(nextAngle),
            0,
            outerRadius * Math.sin(nextAngle)
        );
        
        // Create trimesh for segment
        const vertices = new Float32Array([
            innerStart.x, innerStart.y, innerStart.z,
            outerStart.x, outerStart.y, outerStart.z,
            innerEnd.x, innerEnd.y, innerEnd.z,
            outerEnd.x, outerEnd.y, outerEnd.z
        ]);
        
        const indices = new Int16Array([0, 1, 2, 2, 1, 3]);
        
        const trimeshShape = new CANNON.Trimesh(vertices, indices);
        const segmentBody = new CANNON.Body({
            mass: 0,
            shape: trimeshShape,
            material: physicsWorld.groundMaterial
        });
        
        physicsWorld.world.addBody(segmentBody);
    }
    
    // Add visual elements (start/finish lines, barriers) similar to straight track
    // ... (rest of the createCircleTrack implementation remains similar)
}

function clearTrack() {
    // Remove track objects from scene
    if (trackObjects.track) scene.remove(trackObjects.track);
    if (trackObjects.startLine) scene.remove(trackObjects.startLine);
    if (trackObjects.finishLine) scene.remove(trackObjects.finishLine);
    
    trackObjects.boundaries.forEach(boundary => scene.remove(boundary));
    trackObjects.barriers.forEach(barrier => scene.remove(barrier));
    
    trackObjects.boundaries = [];
    trackObjects.barriers = [];
    
    // Clear physics world (except vehicle)
    if (physicsWorld) {
        const bodiesToRemove = [];
        physicsWorld.world.bodies.forEach(body => {
            if (body !== vehicle?.chassisBody && !vehicle?.wheelBodies.includes(body)) {
                bodiesToRemove.push(body);
            }
        });
        bodiesToRemove.forEach(body => physicsWorld.world.removeBody(body));
    }
}

function resetCar(position = tracks.straight.startPosition, rotation = tracks.straight.startRotation) {
    if (!vehicle || !vehicleVisual) return;
    
    // Create a small delay before reset for visual effect and to avoid physics conflicts
    if (vehicle.isResetting) return; // Prevent multiple resets
    vehicle.isResetting = true;
    
    console.log("RESETTING CAR to position:", position.x, position.y, position.z);
    
    // CRITICAL FIX: First fully stop the vehicle
    vehicle.accelerate(0);
    vehicle.brake(vehicle.maxBrakeForce); // Apply full brakes first to stop momentum
    
    // Wait a short time to let the brakes take effect
    setTimeout(() => {
        // CRITICAL FIX: Do a complete physics step with the vehicle stopped
        physicsWorld.update(1/60);
        
        // CRITICAL FIX: Explicitly stop the chassis body with direct velocity zeroing
        vehicle.chassisBody.velocity.setZero();
        vehicle.chassisBody.angularVelocity.setZero();
        vehicle.chassisBody.force.setZero();
        vehicle.chassisBody.torque.setZero();
        
        // Convert position and rotation to CANNON types
        const cannonPosition = new CANNON.Vec3(position.x, position.y + 1.0, position.z);
        const cannonQuaternion = new CANNON.Quaternion();
        cannonQuaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
        
        // CRITICAL FIX: Directly set position before reset for better control
        vehicle.chassisBody.position.copy(cannonPosition);
        vehicle.chassisBody.quaternion.copy(cannonQuaternion);
        
        // Now do the full reset
        vehicle.reset(cannonPosition, cannonQuaternion);
        
        // CRITICAL FIX: Reset wheel forces individually again
        for (let i = 0; i < 4; i++) {
            vehicle.applyEngineForce(0, i);
            vehicle.setBrake(vehicle.maxBrakeForce * 0.2, i); // Light braking on all wheels
        }
        
        // Update visuals
        vehicle.update();
        vehicleVisual.reset();
        
        // Update camera immediately
        const carPosition = vehicle.chassisBody.position;
        camera.position.set(
            carPosition.x,
            carPosition.y + 5,
            carPosition.z + 10 // Position behind the car
        );
        camera.lookAt(carPosition.x, carPosition.y, carPosition.z);
        
        // Do a few physics steps to stabilize the vehicle
        for (let i = 0; i < 5; i++) {
            physicsWorld.update(1/60);
            vehicle.update();
        }
        
        // Release brakes slightly after reset
        setTimeout(() => {
            vehicle.brake(vehicle.maxBrakeForce * 0.1); // Light braking to prevent rolling
            vehicle.isResetting = false;
            console.log("Reset complete, vehicle at:", 
                    vehicle.chassisBody.position.x.toFixed(2),
                    vehicle.chassisBody.position.y.toFixed(2),
                    vehicle.chassisBody.position.z.toFixed(2));
        }, 100);
    }, 100);
}

function resetGame() {
    gameStarted = false;
    createMenu();
}

function startGame(trackKey) {
    // CRITICAL FIX: Clear any existing physics world and vehicle
    if (physicsWorld && physicsWorld.world) {
        // Properly remove any existing bodies
        if (physicsWorld.world.bodies.length > 0) {
            const bodies = [...physicsWorld.world.bodies];
            bodies.forEach(body => physicsWorld.world.removeBody(body));
        }
    }
    
    // Initialize physics world
    physicsWorld = new PhysicsWorld();
    
    // Create track
    currentTrack = tracks[trackKey];
    currentTrack.create();
    
    // CRITICAL FIX: Ensure vehicle starts above the ground to prevent collision issues
    const startPos = new CANNON.Vec3(
        currentTrack.startPosition.x,
        currentTrack.startPosition.y + 1.0, // Significantly raised position
        currentTrack.startPosition.z
    );
    
    // Create the vehicle
    vehicle = new Vehicle(physicsWorld, startPos);
    vehicleVisual = new VehicleVisual(scene);
    
    // Ensure the vehicle has the correct rotation based on track
    if (currentTrack.startRotation !== undefined) {
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromAxisAngle(
            new CANNON.Vec3(0, 1, 0), // Y-axis rotation
            currentTrack.startRotation
        );
        vehicle.chassisBody.quaternion.copy(quaternion);
    }
    
    // CRITICAL FIX: Let the vehicle "settle" into position
    // Do multiple substeps to ensure it's in a stable position
    for (let i = 0; i < 10; i++) {
        physicsWorld.update(1/60);
        vehicle.update();
    }
    
    // CRITICAL FIX: Debug output of vehicle state
    console.log("Vehicle initialized at:", 
                vehicle.chassisBody.position.x.toFixed(2), 
                vehicle.chassisBody.position.y.toFixed(2), 
                vehicle.chassisBody.position.z.toFixed(2));
    
    // Set up camera to look at the vehicle
    const carPosition = vehicle.chassisBody.position;
    camera.position.set(
        carPosition.x, 
        carPosition.y + 5, 
        carPosition.z + 10 // Position behind the car
    );
    camera.lookAt(carPosition.x, carPosition.y, carPosition.z);
    
    // Start game
    gameStarted = true;
    lastTime = performance.now();
    
    // Remove menu if it exists
    const menuContainer = document.getElementById('menu-container');
    if (menuContainer && menuContainer.parentNode) {
        menuContainer.parentNode.removeChild(menuContainer);
    }
    
    // Show game UI
    const timer = document.getElementById('timer');
    const debugInfo = document.getElementById('debugInfo');
    if (timer) timer.style.display = 'block';
    if (debugInfo) debugInfo.style.display = 'block';
}

function updateVehicle() {
    if (!vehicle || !gameStarted) return;
    
    // Handle keyboard input
    const accelerate = keys.ArrowUp || keys.KeyW;
    const brake = keys.ArrowDown || keys.KeyS;
    const left = keys.ArrowLeft || keys.KeyA;
    const right = keys.ArrowRight || keys.KeyD;
    const reset = keys.KeyR;
    const emergencyBrake = keys.Space;
    
    // Calculate the current speed
    const velocity = vehicle.chassisBody.velocity;
    const currentSpeed = Math.sqrt(
        velocity.x * velocity.x +
        velocity.z * velocity.z
    );
    
    // Always wake up the vehicle
    vehicle.chassisBody.wakeUp();
    
    // Reset car position
    if (reset) {
        resetCar(currentTrack.startPosition, currentTrack.startRotation);
        return;
    }
    
    // Correctly determine forward/backward movement
    // With negative Z being forward, vehicle is moving forward if Z velocity is negative
    const isMovingForward = velocity.z < 0;
    
    // CRITICAL FIX: Use a more progressive starting force
    if (accelerate) {
        // Start with a very gentle force and ramp up
        // This helps prevent jerky movement at start
        let startForce;
        
        if (currentSpeed < 0.1) {
            // Almost stopped - very gentle initial push
            startForce = 0.1;
        } else if (currentSpeed < 1) {
            // Slowly building up - moderate force
            startForce = 0.3;
        } else if (currentSpeed < 5) {
            // Moving at low speed - stronger force
            startForce = 0.6;
        } else {
            // Moving at higher speed - full force
            startForce = 1.0;
        }
        
        vehicle.accelerate(vehicle.maxForce * startForce);
        vehicle.brake(0); // Ensure brakes are off
        
        // Log detailed acceleration info at very low speeds for debugging
        if (currentSpeed < 0.5) {
            console.log("Acceleration", 
                        "Force:", (vehicle.maxForce * startForce).toFixed(2), 
                        "Speed:", currentSpeed.toFixed(2), 
                        "Z Velocity:", velocity.z.toFixed(2));
        }
    } else if (brake) {
        // Handle braking & reverse in a smoother way
        if (currentSpeed < 0.2) {
            // At very low speed, apply reverse force very gently
            vehicle.accelerate(-vehicle.maxForce * 0.2);
            vehicle.brake(0);
        } else if (isMovingForward) {
            // When moving forward, apply progressive braking
            const brakeForce = Math.min(0.5, currentSpeed / 10);
            vehicle.accelerate(0);
            vehicle.brake(vehicle.maxBrakeForce * brakeForce);
        } else {
            // When moving backward, apply progressive braking
            const brakeForce = Math.min(0.5, currentSpeed / 10);
            vehicle.accelerate(0);
            vehicle.brake(vehicle.maxBrakeForce * brakeForce);
        }
    } else {
        // Coasting with minimal resistance
        vehicle.accelerate(0);
        
        // Very light drag when no controls are applied
        if (currentSpeed > 0.5) {
            vehicle.brake(vehicle.maxBrakeForce * 0.01); // Almost no braking - just slight friction
        } else if (currentSpeed > 0.1) {
            // Apply slightly higher brake at very low speed to eventually stop
            vehicle.brake(vehicle.maxBrakeForce * 0.03);
        } else {
            // Apply very light brake when essentially stopped
            vehicle.brake(vehicle.maxBrakeForce * 0.05);
        }
    }
    
    // CRITICAL FIX: Smoother steering with progressive response
    // Higher speed = less steering, more gradual response
    const maxSpeedForFullSteering = 15;
    const steeringFactor = Math.max(0.3, 1 - (currentSpeed / maxSpeedForFullSteering));
    
    // Track previous steering value for smoother transitions
    if (!vehicle.previousSteerValue) {
        vehicle.previousSteerValue = 0;
    }
    
    let targetSteer = 0;
    
    if (left) {
        targetSteer = vehicle.maxSteerVal * steeringFactor;
        if (currentSpeed < 0.5) vehicle.brake(0); // Ensure no brakes when turning from standstill
    } else if (right) {
        targetSteer = -vehicle.maxSteerVal * steeringFactor;
        if (currentSpeed < 0.5) vehicle.brake(0); // Ensure no brakes when turning from standstill
    }
    
    // Smooth steering transition (blend between current and target)
    const steerBlendFactor = currentSpeed < 1 ? 0.5 : 0.1; // Faster transition at low speed
    const newSteerValue = vehicle.previousSteerValue * (1 - steerBlendFactor) + targetSteer * steerBlendFactor;
    vehicle.steer(newSteerValue);
    vehicle.previousSteerValue = newSteerValue;
    
    // Emergency brake
    if (emergencyBrake) {
        vehicle.brake(vehicle.maxBrakeForce);
        vehicle.accelerate(0);
    }
    
    // Update vehicle physics and visuals
    vehicle.update();
    vehicleVisual.update(vehicle.chassisBody, vehicle.wheelBodies);
    
    // Check for vehicle status issues - only reset if significantly off track or flipped
    const position = vehicle.chassisBody.position;
    const rotation = vehicle.chassisBody.quaternion;
    
    // Get upward direction to detect if flipped
    const upVec = new THREE.Vector3(0, 1, 0);
    const carUp = new THREE.Vector3(0, 1, 0);
    carUp.applyQuaternion(new THREE.Quaternion(
        rotation.x, rotation.y, rotation.z, rotation.w
    ));
    
    // Consider the car flipped if its up vector is pointing significantly downward
    const isFlipped = carUp.dot(upVec) < -0.5;
    
    // Only reset in severe conditions
    if (position.y < -5 || Math.abs(position.x) > 50 || 
        Math.abs(position.z) > 50 || isFlipped) {
        resetCar(currentTrack.startPosition, currentTrack.startRotation);
    }
    
    // Update camera
    updateCamera();
}

// New helper functions
function checkVehicleStatus() {
    if (!vehicle) return;
    
    const position = vehicle.chassisBody.position;
    const rotation = vehicle.chassisBody.quaternion;
    
    // Get vehicle orientation to detect if it's flipped
    let isFlipped = false;
    
    // Convert quaternion to euler angles to check if car is flipped
    const upVec = new THREE.Vector3(0, 1, 0);
    const carUp = new THREE.Vector3(0, 1, 0);
    carUp.applyQuaternion(new THREE.Quaternion(
        rotation.x, rotation.y, rotation.z, rotation.w
    ));
    
    // If car's up vector is pointing down, it's flipped
    if (carUp.dot(upVec) < 0) {
        isFlipped = true;
    }
    
    // Check if car has fallen off the track or flipped over
    if (position.y < -5 || // Fallen below the track
        Math.abs(position.x) > 30 || // Gone too far sideways
        Math.abs(position.z) > 100 || // Gone too far forward/backward
        isFlipped || // Car is flipped over
        vehicle.chassisBody.angularVelocity.length() > 20) { // Spinning too fast
        
        // Reset the car
        resetCar(currentTrack.startPosition, currentTrack.startRotation);
    }
}

function updateCamera() {
    if (!vehicle) return;
    
    const carPosition = vehicle.chassisBody.position;
    
    // Calculate target position
    const carDirection = new THREE.Vector3(0, 0, -1);
    carDirection.applyQuaternion(new THREE.Quaternion(
        vehicle.chassisBody.quaternion.x,
        vehicle.chassisBody.quaternion.y,
        vehicle.chassisBody.quaternion.z,
        vehicle.chassisBody.quaternion.w
    ));
    
    // Calculate camera distance based on speed (further back at high speeds)
    const speed = Math.sqrt(
        vehicle.chassisBody.velocity.x * vehicle.chassisBody.velocity.x +
        vehicle.chassisBody.velocity.z * vehicle.chassisBody.velocity.z
    );
    const distanceFactor = Math.min(1.5, 1.0 + (speed / 50));
    
    // Position camera behind car
    camera.position.set(
        carPosition.x - carDirection.x * 8 * distanceFactor,
        carPosition.y + 3.5,
        carPosition.z - carDirection.z * 8 * distanceFactor
    );
    
    // Look slightly ahead of car for better visibility
    camera.lookAt(
        carPosition.x + carDirection.x * 5,
        carPosition.y + 1,
        carPosition.z + carDirection.z * 5
    );
}

function animate() {
    requestAnimationFrame(animate);
    
    if (gameStarted) {
        const time = performance.now();
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;
        
        // Update physics
        physicsWorld.update(deltaTime);
        
        // Update vehicle
        updateVehicle();
    }
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the game loop
animate();

// Export necessary functions and variables
export { startGame, resetGame };

// Create the menu system
function createMenu() {
    menuContainer = document.createElement('div');
    menuContainer.id = 'menu-container';
    menuContainer.style.position = 'absolute';
    menuContainer.style.top = '50%';
    menuContainer.style.left = '50%';
    menuContainer.style.transform = 'translate(-50%, -50%)';
    menuContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    menuContainer.style.padding = '20px';
    menuContainer.style.borderRadius = '10px';
    menuContainer.style.color = 'white';
    menuContainer.style.fontFamily = 'Arial, sans-serif';
    menuContainer.style.textAlign = 'center';
    menuContainer.style.zIndex = '1000';
    
    // Title
    const title = document.createElement('h1');
    title.textContent = 'AIGaming Racing';
    title.style.marginBottom = '20px';
    menuContainer.appendChild(title);
    
    // Track selection
    const trackSelectionTitle = document.createElement('h2');
    trackSelectionTitle.textContent = 'Select Track:';
    trackSelectionTitle.style.marginBottom = '10px';
    menuContainer.appendChild(trackSelectionTitle);
    
    // Track options
    const trackContainer = document.createElement('div');
    trackContainer.style.display = 'flex';
    trackContainer.style.justifyContent = 'center';
    trackContainer.style.gap = '20px';
    trackContainer.style.marginBottom = '30px';
    
    // Add track buttons
    Object.keys(tracks).forEach(trackKey => {
        const track = tracks[trackKey];
        
        const trackBox = document.createElement('div');
        trackBox.style.border = '2px solid white';
        trackBox.style.padding = '15px';
        trackBox.style.borderRadius = '5px';
        trackBox.style.cursor = 'pointer';
        trackBox.style.width = '180px';
        
        const trackName = document.createElement('h3');
        trackName.textContent = track.name;
        trackBox.appendChild(trackName);
        
        const trackDesc = document.createElement('p');
        trackDesc.textContent = track.description;
        trackDesc.style.fontSize = '14px';
        trackBox.appendChild(trackDesc);
        
        // On click event
        trackBox.addEventListener('click', () => {
            startGame(trackKey);
        });
        
        // Hover effect
        trackBox.addEventListener('mouseover', () => {
            trackBox.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        });
        
        trackBox.addEventListener('mouseout', () => {
            trackBox.style.backgroundColor = 'transparent';
        });
        
        trackContainer.appendChild(trackBox);
    });
    
    menuContainer.appendChild(trackContainer);
    
    // Controls section
    const controlsTitle = document.createElement('h2');
    controlsTitle.textContent = 'Controls:';
    controlsTitle.style.marginBottom = '10px';
    menuContainer.appendChild(controlsTitle);
    
    const controlsList = document.createElement('ul');
    controlsList.style.listStyleType = 'none';
    controlsList.style.padding = '0';
    
    const controls = [
        { key: 'Arrow Up / W', action: 'Accelerate' },
        { key: 'Arrow Down / S', action: 'Brake / Reverse' },
        { key: 'Arrow Left / A', action: 'Turn Left' },
        { key: 'Arrow Right / D', action: 'Turn Right' },
        { key: 'Space', action: 'Emergency Brake' },
        { key: 'R', action: 'Reset Car' }
    ];
    
    controls.forEach(control => {
        const item = document.createElement('li');
        item.style.marginBottom = '5px';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        
        const keySpan = document.createElement('span');
        keySpan.textContent = control.key;
        keySpan.style.fontWeight = 'bold';
        keySpan.style.marginRight = '20px';
        
        const actionSpan = document.createElement('span');
        actionSpan.textContent = control.action;
        
        item.appendChild(keySpan);
        item.appendChild(actionSpan);
        controlsList.appendChild(item);
    });
    
    menuContainer.appendChild(controlsList);
    
    document.body.appendChild(menuContainer);
    
    // Hide in-game UI elements while in menu
    document.getElementById('timer').style.display = 'none';
    const debugInfo = document.getElementById('debugInfo');
    if (debugInfo) debugInfo.style.display = 'none';
}

// Show the menu when the game loads
createMenu(); 