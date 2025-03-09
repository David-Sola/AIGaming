import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export class PhysicsWorld {
    constructor() {
        // Initialize Cannon.js world with standard gravity
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.81, 0)
        });
        
        // Use the SAP broadphase for improved performance
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        
        // Solver settings for performance at high speeds
        this.world.solver.iterations = 6;
        this.world.solver.tolerance = 0.02;
        
        // Disable sleeping for consistent simulation
        this.world.allowSleep = false;
        
        // Set up materials for ground and wheels
        this.groundMaterial = new CANNON.Material('ground');
        this.wheelMaterial = new CANNON.Material('wheel');
        
        // Adjust wheel-ground contact for smoother, more realistic interactions
        const wheelGroundContact = new CANNON.ContactMaterial(
            this.wheelMaterial,
            this.groundMaterial,
            {
                friction: 1.2, // Increased from 0.9 for better grip on slopes
                restitution: 0.01, // Further reduced for less bouncing on height changes
                contactEquationStiffness: 1000, // Reduced for smoother transitions over height changes
                contactEquationRelaxation: 3.0, // Increased for smoother response
                frictionEquationStiffness: 1000, // Matches contact equation stiffness
                frictionEquationRelaxation: 2.5, // Added for more consistent friction response
            }
        );
        this.world.addContactMaterial(wheelGroundContact);
        
        // Global contact material settings (lower friction for less abrupt stops)
        this.world.defaultContactMaterial.friction = 0.2; // Increased slightly for more realistic physics
        this.world.defaultContactMaterial.restitution = 0.05; // Reduced for less bouncing
        
        // Fixed timestep for stable physics
        this.fixedTimeStep = 1.0 / 60.0;
        this.maxSubSteps = 3;
    }

    update(deltaTime) {
        // Clamp delta to avoid instability (especially after lag/pauses)
        const maxDelta = 1 / 30;
        const clampedDelta = Math.min(deltaTime, maxDelta);
        this.world.step(this.fixedTimeStep, clampedDelta, this.maxSubSteps);
    }
}

export class Vehicle {
    constructor(physicsWorld, position = new CANNON.Vec3(0, 1, 0)) {
        this.world = physicsWorld.world;
        
        // Adjusted force/brake values for smoother, more realistic driving
        this.maxForce = 7500; // Lower max force so full power isn't applied instantly
        this.maxSteerVal = 0.3;
        this.maxBrakeForce = 8000; // Reduced brake force for gradual deceleration
        
        // New throttle property for smooth ramping (value between 0 and 1)
        this.currentThrottle = 0;
        this.throttleIncreaseRate = 0.5; // Increase per second when accelerating
        this.throttleDecreaseRate = 0.3; // Decrease per second when not accelerating
        
        // Create vehicle chassis
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2));
        const startPosition = new CANNON.Vec3(position.x, position.y, position.z);
        this.chassisBody = new CANNON.Body({
            mass: 1200,
            position: startPosition,
            shape: chassisShape,
            material: physicsWorld.groundMaterial
        });
        
        // Lower damping values for higher top speeds and more realistic inertia
        this.chassisBody.angularDamping = 0.05;
        this.chassisBody.linearDamping = 0.005;
        this.chassisBody.allowSleep = false;
        
        // Zero out initial velocities/forces
        this.chassisBody.velocity.set(0, 0, 0);
        this.chassisBody.angularVelocity.set(0, 0, 0);
        this.chassisBody.force.set(0, 0, 0);
        this.chassisBody.torque.set(0, 0, 0);
        
        // Configure the vehicle using a RaycastVehicle
        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0,     // x is right
            indexUpAxis: 1,        // y is up
            indexForwardAxis: 2,   // z axis (negative z is forward)
        });
        
        // Wheel options with settings tuned for smoother behavior
        const wheelOptions = {
            radius: 0.7,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 30, // Reduced from 35 for smoother ride over undulating terrain
            suspensionRestLength: 0.4, // Increased from 0.3 for more suspension travel
            frictionSlip: 2.5, // Reduced for more consistent behavior on slopes
            dampingRelaxation: 2.2, // Tuned for smoother ride
            dampingCompression: 4.0, // Slightly reduced for better height transitions
            maxSuspensionForce: 60000, // Increased for better stability on slopes
            rollInfluence: 0.01, // Reduced for more stability on lateral slopes
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
            maxSuspensionTravel: 0.7, // Increased from 0.3 for better handling of height changes
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Define wheel positions for stability
        const wheelPositions = [
            { x: -2, y: -1.5, z: -3.9 },   // Front left
            { x: 2, y: -1.5, z: -3.9 },    // Front right
            { x: -2, y: -1.5, z: 2 },    // Rear left
            { x: 2, y: -1.5, z: 2 }      // Rear right
        ];

        this.wheelBodies = [];
        
        // Add wheels at the defined positions
        wheelPositions.forEach(pos => {
            const connectionPoint = new CANNON.Vec3(pos.x, pos.y, pos.z);
            wheelOptions.chassisConnectionPointLocal.copy(connectionPoint);
            this.vehicle.addWheel(wheelOptions);
        });
        
        // Add the vehicle to the physics world
        this.vehicle.addToWorld(this.world);
        
        // Create and orient the wheel bodies correctly
        this.vehicle.wheelInfos.forEach((wheel, index) => {
            const cylinderShape = new CANNON.Cylinder(
                wheel.radius,
                wheel.radius,
                wheel.radius * 0.5,
                20
            );
            
            const wheelBody = new CANNON.Body({
                mass: 0,
                material: physicsWorld.wheelMaterial
            });
            
            // Rotate the cylinder so its local y-axis aligns with the wheel axle (x-axis)
            const quaternion = new CANNON.Quaternion();
            quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
            wheelBody.addShape(cylinderShape, new CANNON.Vec3(), quaternion);
            
            // Use kinematic type for wheels (their positions are updated manually)
            wheelBody.type = CANNON.Body.KINEMATIC;
            this.wheelBodies.push(wheelBody);
            this.world.addBody(wheelBody);
        });
        
        // Initialize wheel forces and steering to zero
        this.initWheels();
    }
    
    initWheels() {
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.applyEngineForce(0, i);
            this.setBrake(0, i);
            if (i < 2) this.setSteeringValue(0, i);
        }
    }
    
    update() {
        // Update wheel positions/orientations from the physics simulation
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.updateWheelTransform(i);
            const transform = this.vehicle.wheelInfos[i].worldTransform;
            this.wheelBodies[i].position.copy(transform.position);
            this.wheelBodies[i].quaternion.copy(transform.quaternion);
        }
    }
    
    // Control methods
    setBrake(brakeForce = 0, wheelIndex = -1) {
        this.chassisBody.wakeUp();
        if (wheelIndex === -1) {
            // Apply braking to all wheels
            for (let i = 0; i < 4; i++) {
                this.vehicle.setBrake(brakeForce, i);
            }
        } else {
            this.vehicle.setBrake(brakeForce, wheelIndex);
        }
    }
    
    setSteeringValue(steerValue, wheelIndex) {
        this.chassisBody.wakeUp();
        this.vehicle.setSteeringValue(steerValue, wheelIndex);
    }
    
    applyEngineForce(force, wheelIndex) {
        this.chassisBody.wakeUp();
        this.vehicle.applyEngineForce(force, wheelIndex);
    }
    
    /**
     * Smoothly apply acceleration.
     * Call accelerate(true) each frame when the accelerator is pressed,
     * and accelerate(false) when it is released.
     */
    accelerate(accelerating) {
        const dt = 1 / 20; // assuming 60fps; ideally, pass delta time
        if (accelerating) {
            // Gradually increase throttle
            this.currentThrottle = Math.min(1, this.currentThrottle + dt * this.throttleIncreaseRate);
        } else {
            // Gradually decay throttle
            this.currentThrottle = Math.max(0, this.currentThrottle - dt * this.throttleDecreaseRate);
        }
        
        // Calculate base engine force
        let engineForce = this.currentThrottle * this.maxForce;
        
        // Adjust force based on slope
        // Get chassis orientation for slope-based force adjustment
        const upAxis = new CANNON.Vec3(0, 1, 0);
        const chassisUp = new CANNON.Vec3();
        this.chassisBody.quaternion.vmult(upAxis, chassisUp);
        
        // Calculate the dot product with world up vector to determine slope factor
        // 1.0 = flat, <1.0 = uphill/downhill
        const slopeFactor = chassisUp.dot(upAxis);
        
        // Get forward direction to determine if going uphill or downhill
        const forwardAxis = new CANNON.Vec3(0, 0, -1); // z is forward axis in vehicle space
        const chassisForward = new CANNON.Vec3();
        this.chassisBody.quaternion.vmult(forwardAxis, chassisForward);
        
        // Project chassisForward onto the horizontal plane
        const horizontalForward = new CANNON.Vec3(
            chassisForward.x,
            0,
            chassisForward.z
        ).unit();
        
        // Get world gravity direction (normalized)
        const gravity = new CANNON.Vec3(0, -1, 0);
        
        // Project gravity onto the forward direction to see if going uphill/downhill
        const slopeDirection = horizontalForward.dot(
            new CANNON.Vec3(0, chassisUp.y < 0 ? -chassisUp.y : chassisUp.y, 0)
        );
        
        // Adjust force based on slope - apply more force uphill, less downhill
        // The steeper the slope (smaller slopeFactor), the more adjustment
        const slopeAdjustment = 1 + (1 - slopeFactor) * 2 * slopeDirection;
        engineForce = engineForce * slopeAdjustment;
        
        // Distribute the force with more to rear wheels for better traction
        this.applyEngineForce(engineForce * 0.4, 0); // Front left
        this.applyEngineForce(engineForce * 0.4, 1); // Front right
        this.applyEngineForce(engineForce * 0.2, 2); // Rear left
        this.applyEngineForce(engineForce * 0.2, 3); // Rear right
    }
    
    brake(force = this.maxBrakeForce) {
        this.chassisBody.wakeUp();
        
        // Get chassis orientation to determine slope
        const upAxis = new CANNON.Vec3(0, 1, 0);
        const chassisUp = new CANNON.Vec3();
        this.chassisBody.quaternion.vmult(upAxis, chassisUp);
        
        // Calculate the dot product with world up vector to determine slope factor
        const slopeFactor = chassisUp.dot(upAxis);
        
        // Calculate how steep the slope is (1.0 = flat, <1.0 = sloped)
        // Adjust braking force - apply more force on downhill to counteract gravity
        const adjustedForce = force * (2 - slopeFactor);
        
        // Apply the adjusted braking force
        this.setBrake(adjustedForce);
    }
    
    steer(steerValue) {
        this.chassisBody.wakeUp();
        const clampedSteer = Math.max(-this.maxSteerVal, Math.min(this.maxSteerVal, steerValue));
        // Apply steering to front wheels
        this.setSteeringValue(clampedSteer, 0);
        this.setSteeringValue(clampedSteer, 1);
    }
    
    /**
     * Reset the vehicle's position and state.
     */
    reset(position = new CANNON.Vec3(0, 1, 0), quaternion = new CANNON.Quaternion()) {
        // Zero out velocities and forces
        this.chassisBody.velocity.setZero();
        this.chassisBody.angularVelocity.setZero();
        this.chassisBody.force.setZero();
        this.chassisBody.torque.setZero();
        
        // Reset position and orientation
        this.chassisBody.position.copy(position);
        this.chassisBody.quaternion.copy(quaternion);
        
        // Reset forces and steering on all wheels
        for (let i = 0; i < 4; i++) {
            this.applyEngineForce(0, i);
            this.setBrake(0, i);
            if (i < 2) this.setSteeringValue(0, i);
        }
        
        // Apply a slight brake to ensure the car remains stationary
        this.setBrake(this.maxBrakeForce * 0.1);
        
        // Force update the suspension and wheel positions
        this.update();
        
        // Make sure the chassis is awake 
        this.chassisBody.wakeUp();
        
        // Reset throttle state
        this.currentThrottle = 0;
        
        // Extra stability - apply slight downward force to prevent bouncing
        this.chassisBody.force.y = -this.chassisBody.mass * 9.81 * 1.1; // Slightly more than gravity
        
        // Realign suspension by setting it to rest length
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            const wheelInfo = this.vehicle.wheelInfos[i];
            wheelInfo.suspensionLength = wheelInfo.restLength;
        }
        
        // Force another update after suspension adjustment
        this.update();
    }
}
