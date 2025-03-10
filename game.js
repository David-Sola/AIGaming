// Import necessary libraries
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import GameState from './gameState.js';
import NetworkManager from './network.js';
import { PhysicsWorld, Vehicle } from './physics.js';
import { VehicleVisual } from './vehicleVisual.js';
// Import track modules
import { tracks, clearTrack } from './tracks/index.js';

// Initialize game state and network manager
const gameState = new GameState();
const networkManager = new NetworkManager(gameState);

// Create the New AI World link
function createNewAIWorldLink() {
    const linkContainer = document.createElement('div');
    linkContainer.style.position = 'fixed';
    linkContainer.style.top = '20px';
    linkContainer.style.left = '20px';
    linkContainer.style.zIndex = '1000';
    
    const link = document.createElement('a');
    link.href = 'https://newaiworld.com/';
    link.target = '_blank'; // Open in new tab
    link.textContent = 'New AI World';
    link.style.color = '#ffffff';
    link.style.textDecoration = 'none';
    link.style.fontSize = '24px';
    link.style.fontFamily = 'Arial, sans-serif';
    link.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
    link.style.transition = 'color 0.3s ease';
    
    // Hover effect
    link.addEventListener('mouseover', () => {
        link.style.color = '#00ff00';
    });
    link.addEventListener('mouseout', () => {
        link.style.color = '#ffffff';
    });
    
    linkContainer.appendChild(link);
    document.body.appendChild(linkContainer);
}

// Call the function to create the link
createNewAIWorldLink();

// Game state
let gameStarted = false;
let currentTrack = null;
let physicsWorld = null;
let vehicle = null;
let vehicleVisual = null;
let lastTime = performance.now();
// Background sphere
let skyboxSphere = null;
let skyboxRotationSpeed = 0.0005; // Speed of rotation (adjust as needed)

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
// We'll replace the simple background color with our skybox sphere
// scene.background = new THREE.Color(0x87CEEB); // Sky blue background

// Function to create the skybox sphere
function createSkyboxSphere() {
    // Create a large sphere geometry
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    // Important: Flip the geometry inside out so we see the texture from inside the sphere
    geometry.scale(1, 1, 1);
    
    // Load the background texture with proper error handling
    const textureLoader = new THREE.TextureLoader();
    
    // Add loading manager to track progress and errors
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onError = function(url) {
        console.error('Error loading texture:', url);
    };
    
    textureLoader.manager = loadingManager;
    
    // Log loading progress
    console.log("Loading background texture from: ./Background/BackgroundEnhanced.jpg");
    
    textureLoader.load(
        './Background/BackgroundEnhanced.jpg', 
        function(texture) {
            // Success callback
            console.log("Background texture loaded successfully");
            texture.mapping = THREE.EquirectangularReflectionMapping;
            
            // Create material with the loaded texture
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.BackSide, // Render the inside of the sphere
                color: 0x222222 // Add a dark gray tint to darken the texture
            });
            
            // Create the skybox sphere mesh
            skyboxSphere = new THREE.Mesh(geometry, material);
            scene.add(skyboxSphere);
            
            console.log("Skybox sphere added to scene");
        },
        undefined, // Progress callback (not needed)
        function(error) {
            // Error callback
            console.error("Error loading background texture:", error);
            
            // Create a fallback colored sphere as backup
            const fallbackMaterial = new THREE.MeshBasicMaterial({
                color: 0x87CEEB, // Sky blue
                side: THREE.BackSide
            });
            
            skyboxSphere = new THREE.Mesh(geometry, fallbackMaterial);
            scene.add(skyboxSphere);
            
            console.log("Fallback skybox created due to texture loading error");
        }
    );
}

// Call createSkyboxSphere after scene setup
createSkyboxSphere();

// Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 10);
scene.add(directionalLight);

// Create a perspective camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 3, 1000);
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

function resetCar(position = tracks.straight.startPosition, rotation = tracks.straight.startRotation) {
    if (!vehicle || !vehicleVisual) return;
    
    // Create a small delay before reset for visual effect and to avoid physics conflicts
    if (vehicle.isResetting) return; // Prevent multiple resets
    vehicle.isResetting = true;
    
    console.log("RESETTING CAR to position:", position.x, position.y, position.z);
    
    // First fully stop the vehicle
    vehicle.accelerate(0);
    vehicle.brake(vehicle.maxBrakeForce);
    
    // Wait a short time to let the brakes take effect
    setTimeout(() => {
        // Do a complete physics step with the vehicle stopped
        physicsWorld.update(1/60);
        
        // Explicitly stop the chassis body with direct velocity zeroing
        vehicle.chassisBody.velocity.setZero();
        vehicle.chassisBody.angularVelocity.setZero();
        vehicle.chassisBody.force.setZero();
        vehicle.chassisBody.torque.setZero();
        
        // Ensure starting well above the track surface to avoid clipping
        const cannonPosition = new CANNON.Vec3(
            position.x,
            position.y + 2.0, // Increased clearance to ensure vehicle is above track
            position.z
        );
        const cannonQuaternion = new CANNON.Quaternion();
        cannonQuaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
        
        // Directly set position before reset for better control
        vehicle.chassisBody.position.copy(cannonPosition);
        vehicle.chassisBody.quaternion.copy(cannonQuaternion);
        
        // Now do the full reset
        vehicle.reset(cannonPosition, cannonQuaternion);
        
        // Reset wheel forces individually
        for (let i = 0; i < 4; i++) {
            vehicle.applyEngineForce(0, i);
            vehicle.setBrake(0, i); // No brake force initially to let vehicle settle naturally
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
        
        // Do more physics steps to allow the vehicle to settle onto the track
        for (let i = 0; i < 15; i++) {
            physicsWorld.update(1/60);
            vehicle.update();
        }
        
        // After settling, apply a very light brake to keep from rolling
        setTimeout(() => {
            vehicle.brake(vehicle.maxBrakeForce * 0.02); // Very light braking
            vehicle.isResetting = false;
            console.log("Reset complete, vehicle at:", 
                    vehicle.chassisBody.position.x.toFixed(2),
                    vehicle.chassisBody.position.y.toFixed(2),
                    vehicle.chassisBody.position.z.toFixed(2));
        }, 200); // Increased from 100ms to 200ms for better settling
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
    // Call the track creation function with required parameters
    currentTrack.create(scene, physicsWorld, trackObjects);
    
    // CRITICAL FIX: Define a proper starting position
    // Use the track's startPosition, which is dynamically updated for the sinusoidal track
    const startPos = new CANNON.Vec3(
        currentTrack.startPosition.x,
        currentTrack.startPosition.y + 1.0, // Use track's defined height plus clearance
        currentTrack.startPosition.z
    );
    
    // CRITICAL FIX: Add a small delay to ensure the track is fully initialized
    setTimeout(() => {
        console.log("Creating vehicle at position:", startPos.x, startPos.y, startPos.z);
        
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
            
            // For sinusoidal track, also adjust orientation to match track slope
            if (trackKey === 'straight_height') {
                // Calculate the slope at the starting position
                const amplitude = 2; // Same as in track creation
                const frequency = 0.1; // Same as in track creation
                const z = startPos.z;
                
                // Calculate derivative of sine wave to find slope
                const slope = amplitude * frequency * Math.cos(frequency * z);
                
                // Create a quaternion for pitch adjustment (rotation around X axis)
                const pitchQuaternion = new CANNON.Quaternion();
                // Negative because we want to match the slope direction
                const angle = -Math.atan(slope);
                pitchQuaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), angle);
                
                // Combine with yaw rotation (multiply quaternions)
                vehicle.chassisBody.quaternion = vehicle.chassisBody.quaternion.mult(pitchQuaternion);
            }
        }
        
        // Special handling for straight_height track
        if (trackKey === 'straight_height') {
            // Add a few initial physics stabilization steps
            for (let i = 0; i < 10; i++) {
                physicsWorld.update(1/60);
                vehicle.update();
            }
            
            // Apply very light braking to prevent unwanted sliding at start
            vehicle.setBrake(vehicle.maxBrakeForce * 0.1);
        }
        
        // Add event listener for reset key
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyR') {
                resetCar(currentTrack.startPosition, currentTrack.startRotation);
            }
        });
        
        // Game is now started
        gameStarted = true;
        
        // Remove menu if it exists
        if (menuContainer && menuContainer.parentNode) {
            menuContainer.parentNode.removeChild(menuContainer);
            menuContainer = null;
        }
        
        // Start animation loop
        animate();
    }, 500);
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
    
    // CRITICAL FIX: Ensure we maintain Y position above ground
    if (vehicle.chassisBody.position.y < 0.5) {
        vehicle.chassisBody.position.y = 0.7;
    }
    
    // Correctly determine forward/backward movement
    // With negative Z being forward, vehicle is moving forward if Z velocity is negative
    const isMovingForward = velocity.z < 0;
    
    // CRITICAL FIX: Apply smoother initial force to avoid jitters
    if (accelerate) {
        if (currentSpeed < 0.1) {
            // Apply gradual acceleration to prevent jitter at start
            vehicle.accelerate(vehicle.maxForce * 200); // Start gently
            
            console.log("Gradual acceleration applied.");
        } else {
            // Normal acceleration when already moving
            const forceMultiplier = Math.max(2, Math.min(2.0, 5.0 / currentSpeed));
            vehicle.accelerate(vehicle.maxForce * forceMultiplier);
        }
        
        vehicle.brake(0); // Ensure brakes are off
        
        // Log acceleration info
        console.log(`Accelerating - Speed: ${currentSpeed.toFixed(2)}, Z pos: ${vehicle.chassisBody.position.z.toFixed(2)}`);
    } else if (brake) {
        // Handle braking & reverse
        if (currentSpeed < 0.2) {
            // At very low speed, apply reverse force and a backward impulse
            vehicle.accelerate(-vehicle.maxForce);
            
            // Apply a small backward impulse to overcome initial resistance
            if (Math.abs(velocity.z) < 0.1) {
                vehicle.chassisBody.applyImpulse(
                    new CANNON.Vec3(0, 0, vehicle.maxForce * 0.1), // Impulse in positive Z (backward)
                    new CANNON.Vec3(0, 0, 0) // At center of mass
                );
            }
            
            vehicle.brake(0);
        } else if (isMovingForward) {
            // When moving forward, apply strong braking
            vehicle.accelerate(0);
            vehicle.brake(vehicle.maxBrakeForce * 0.7);
        } else {
            // When moving backward, apply braking
            vehicle.accelerate(0);
            vehicle.brake(vehicle.maxBrakeForce * 0.5);
        }
    } else {
        // Coasting with minimal resistance
        vehicle.accelerate(0);
        
        // Very light drag when no controls are applied
        if (currentSpeed > 0.5) {
            vehicle.brake(vehicle.maxBrakeForce * 0.01); // Almost no braking
        } else if (currentSpeed > 0.1) {
            vehicle.brake(vehicle.maxBrakeForce * 0.03);
        } else {
            vehicle.brake(0); // No braking when stopped to prevent resistance to initial movement
        }
    }
    
    // Smoother steering with progressive response
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
    // Increased boundaries to match the track's sinusoidal amplitude
    if (position.y < -10 || Math.abs(position.x) > 150 || 
        Math.abs(position.z) > 550 || isFlipped) {
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
    // Increased boundaries to better match the track's sinusoidal amplitude
    if (position.y < -10 || // Fallen below the track
        Math.abs(position.x) > 150 || // Gone too far sideways (increased for sinusoidal track)
        Math.abs(position.z) > 550 || // Gone too far forward/backward (increased for track length)
        isFlipped || // Car is flipped over
        vehicle.chassisBody.angularVelocity.length() > 25) { // Increased threshold for spinning
        
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
        carPosition.y + 7.5,
        carPosition.z - carDirection.z * 8 * distanceFactor
    );
    
    // Look slightly ahead of car for better visibility
    camera.lookAt(
        carPosition.x + carDirection.x * 5,
        carPosition.y + 1.5,
        carPosition.z + carDirection.z * 5
    );
}

function animate() {
    requestAnimationFrame(animate);
    
    // Rotate the skybox sphere if it exists
    if (skyboxSphere) {
        skyboxSphere.rotation.y += skyboxRotationSpeed;
    }
    
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