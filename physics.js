import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export class PhysicsWorld {
    constructor() {
        // Initialize Cannon.js world with appropriate gravity
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.81, 0) 
        });
        
        // Use standard broadphase for more reliable physics
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        
        // CRITICAL FIX: Reduced solver iterations for better performance at high speeds
        this.world.solver.iterations = 6; // Reduced from 8
        this.world.solver.tolerance = 0.02; // Increased tolerance for better performance
        
        // Disable sleeping for more reliable physics
        this.world.allowSleep = false;
        
        // Set up contact material properties
        this.groundMaterial = new CANNON.Material('ground');
        this.wheelMaterial = new CANNON.Material('wheel');
        
        // CRITICAL FIX: Optimized wheel-ground contact for high-speed performance
        const wheelGroundContact = new CANNON.ContactMaterial(
            this.wheelMaterial,
            this.groundMaterial,
            {
                friction: 2.0, // Reduced from 3.0 for less resistance at high speeds
                restitution: 0.1,
                contactEquationStiffness: 1000,
                contactEquationRelaxation: 3,
                frictionEquationStiffness: 1000,
            }
        );
        
        this.world.addContactMaterial(wheelGroundContact);
        
        // CRITICAL FIX: Reduced global friction for better high-speed performance
        this.world.defaultContactMaterial.friction = 0.2; // Reduced from 0.3
        this.world.defaultContactMaterial.restitution = 0.1;
        
        // Fixed timestep for physics
        this.fixedTimeStep = 1.0 / 60.0;
        this.maxSubSteps = 3;
    }

    update(deltaTime) {
        // Use a maximum time delta to prevent instability after pauses/lag
        const maxDelta = 1/30;
        const clampedDelta = Math.min(deltaTime, maxDelta);
        
        // Step the physics world
        this.world.step(this.fixedTimeStep, clampedDelta, this.maxSubSteps);
    }
}

export class Vehicle {
    constructor(physicsWorld, position = new CANNON.Vec3(0, 1, 0)) {
        this.world = physicsWorld.world;
        
        // CRITICAL FIX: Dramatically increased force for higher top speed
        this.maxForce = 15000; // Doubled from 7500 for much higher top speed
        this.maxSteerVal = 0.3;
        this.maxBrakeForce = 15000;
        
        // Create vehicle chassis with proper dimensions
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2));
        
        // Keep Y position lower to prevent initial flying
        const startPosition = new CANNON.Vec3(
            position.x,
            position.y,
            position.z
        );
        
        this.chassisBody = new CANNON.Body({
            mass: 1200,
            position: startPosition,
            shape: chassisShape,
            material: physicsWorld.groundMaterial
        });
        
        // CRITICAL FIX: Reduced damping to allow higher top speed
        this.chassisBody.angularDamping = 0.5; // Reduced from 0.6
        this.chassisBody.linearDamping = 0.05; // Significantly reduced from 0.2 to allow higher speeds
        
        // Disable sleeping for the chassis
        this.chassisBody.allowSleep = false;
        
        // Zero all initial velocity and forces
        this.chassisBody.velocity.set(0, 0, 0);
        this.chassisBody.angularVelocity.set(0, 0, 0);
        this.chassisBody.force.set(0, 0, 0);
        this.chassisBody.torque.set(0, 0, 0);
        
        // Define the vehicle axis configuration
        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0,     // x is right
            indexUpAxis: 1,        // y is up
            indexForwardAxis: 2,   // z axis (negative z is forward)
        });
        
        // CRITICAL FIX: Further optimized wheel options for better speed
        const wheelOptions = {
            radius: 0.5,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 35, // Reduced from 40 for smoother ride at high speeds
            suspensionRestLength: 0.3,
            frictionSlip: 4.0, // Reduced from 5.0 for less resistance at high speeds
            dampingRelaxation: 2.5,
            dampingCompression: 4.5,
            maxSuspensionForce: 50000,
            rollInfluence: 0.05,
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
            maxSuspensionTravel: 0.3,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Improved wheel positioning for better stability
        const wheelPositions = [
            { x: -1, y: -0.1, z: -1.6 },   // Front left
            { x: 1, y: -0.1, z: -1.6 },    // Front right
            { x: -1, y: -0.1, z: 1.6 },    // Rear left
            { x: 1, y: -0.1, z: 1.6 }      // Rear right
        ];

        this.wheelBodies = [];
        
        // Add wheels with proper connection points
        wheelPositions.forEach(pos => {
            const connectionPoint = new CANNON.Vec3(pos.x, pos.y, pos.z);
            wheelOptions.chassisConnectionPointLocal.copy(connectionPoint);
            this.vehicle.addWheel(wheelOptions);
        });
        
        // Add the vehicle to the world
        this.vehicle.addToWorld(this.world);
        
        // Create wheel bodies with PROPER ORIENTATION
        this.vehicle.wheelInfos.forEach((wheel, index) => {
            // Create a properly oriented cylinder for the wheel
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
            
            // The cylinder's local y-axis needs to be rotated 
            // to match the wheel's axle (which is along the local x-axis)
            const quaternion = new CANNON.Quaternion();
            quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
            
            // Add the shape with the rotation to align it properly
            wheelBody.addShape(cylinderShape, new CANNON.Vec3(), quaternion);
            wheelBody.type = CANNON.Body.KINEMATIC;
            this.wheelBodies.push(wheelBody);
            this.world.addBody(wheelBody);
        });
        
        // Initialize all wheels with zero forces
        this.initWheels();
        
        // CRITICAL FIX: Add properties to track speed for progressive acceleration
        this.lastSpeed = 0;
        this.accelerationTimer = 0;
    }
    
    // Initialize wheels with zero forces
    initWheels() {
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.applyEngineForce(0, i);
            this.setBrake(0, i);
            if (i < 2) this.setSteeringValue(0, i);
        }
    }
    
    update() {
        // Update wheel positions and orientations based on vehicle state
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
            // Apply to all wheels
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
    
    // CRITICAL FIX: Completely redesigned acceleration method with progressive force scaling
    accelerate(force = this.maxForce) {
        this.chassisBody.wakeUp();
        
        // Calculate current speed
        const velocity = this.chassisBody.velocity;
        const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        
        // CRITICAL FIX: Implement progressive force scaling based on speed
        // This is the key to achieving higher top speeds
        let forceMultiplier;
        
        if (currentSpeed < 10) {
            // Low speed: Apply high force to overcome initial resistance
            forceMultiplier = 2.0;
        } else if (currentSpeed < 30) {
            // Medium speed: Maintain strong acceleration
            forceMultiplier = 4;
        } else if (currentSpeed < 50) {
            // High speed: Increase force to overcome increased air resistance
            forceMultiplier = 8;
        } else if (currentSpeed < 70) {
            // Very high speed: Apply even more force
            forceMultiplier = 20.0;
        } else {
            // Extreme speed: Maximum force to keep accelerating
            forceMultiplier = 30.0;
        }
        
        // CRITICAL FIX: Apply acceleration boost if speed is increasing
        // This helps overcome plateaus in acceleration
        if (currentSpeed > this.lastSpeed) {
            this.accelerationTimer += 1/60; // Assuming 60fps
            if (this.accelerationTimer > 1.0) {
                // After 1 second of continuous acceleration, apply boost
                forceMultiplier *= 1.2;
            }
        } else {
            // Reset acceleration timer if not accelerating
            this.accelerationTimer = 0;
        }
        
        // Store current speed for next comparison
        this.lastSpeed = currentSpeed;
        
        // Apply NEGATIVE force to move forward (in negative Z direction)
        const forwardForce = force * forceMultiplier;
        
        // Apply force distribution for optimal acceleration
        // More power to rear wheels for better acceleration
        this.applyEngineForce(forwardForce * 0.3, 2); // Rear left - more power
        this.applyEngineForce(forwardForce * 0.3, 3); // Rear right - more power
        
        // Some power to front wheels for better traction
        this.applyEngineForce(forwardForce * 0.7, 0); // Front left - less power
        this.applyEngineForce(forwardForce * 0.7, 1); // Front right - less power
    }
    
    brake(force = this.maxBrakeForce) {
        this.chassisBody.wakeUp();
        this.setBrake(force);
    }
    
    steer(steerValue) {
        this.chassisBody.wakeUp();
        
        const clampedSteer = Math.max(-this.maxSteerVal, Math.min(this.maxSteerVal, steerValue));
        // Apply steering to front wheels
        this.setSteeringValue(clampedSteer, 0);
        this.setSteeringValue(clampedSteer, 1);
    }
    
    // Improved reset function to prevent flying
    reset(position = new CANNON.Vec3(0, 1, 0), quaternion = new CANNON.Quaternion()) {
        // Zero all velocities and forces first
        this.chassisBody.velocity.setZero();
        this.chassisBody.angularVelocity.setZero();
        this.chassisBody.force.setZero();
        this.chassisBody.torque.setZero();
        
        // Reset chassis position and rotation
        this.chassisBody.position.copy(position);
        this.chassisBody.quaternion.copy(quaternion);
        
        // Apply zero force to all wheels
        for (let i = 0; i < 4; i++) {
            this.applyEngineForce(0, i);
            this.setBrake(0, i);
            if (i < 2) this.setSteeringValue(0, i);
        }
        
        // Apply a small brake to ensure the car stays put
        this.setBrake(this.maxBrakeForce * 0.1);
        
        // Reset wheel transforms
        this.update();
        
        // Ensure the chassis is awake to receive the changes
        this.chassisBody.wakeUp();
        
        // Reset acceleration tracking
        this.lastSpeed = 0;
        this.accelerationTimer = 0;
    }
} 