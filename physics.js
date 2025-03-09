import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export class PhysicsWorld {
    constructor() {
        // Initialize Cannon.js world with appropriate gravity
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.81, 0) 
        });
        
        // Set up broadphase - SAP is good for vehicles
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        
        // CRITICAL FIX: Use default solver settings for more reliable physics
        this.world.solver.iterations = 10;
        this.world.solver.tolerance = 0.01;
        
        // Allow sleeping for performance but with a higher threshold
        this.world.allowSleep = true;
        this.world.sleepTimeLimit = 1.0;
        this.world.sleepSpeedLimit = 1.0; // Higher threshold to prevent premature sleeping
        
        // Set up contact material properties
        this.groundMaterial = new CANNON.Material('ground');
        this.wheelMaterial = new CANNON.Material('wheel');
        
        // CRITICAL FIX: Significantly improve wheel-ground contact
        const wheelGroundContact = new CANNON.ContactMaterial(
            this.wheelMaterial,
            this.groundMaterial,
            {
                friction: 4.0, // Dramatically increased friction
                restitution: 0.0, // No bounce at all
                contactEquationStiffness: 1000,
                contactEquationRelaxation: 3,
                frictionEquationStiffness: 1000,
            }
        );
        
        this.world.addContactMaterial(wheelGroundContact);
        
        // CRITICAL FIX: Add default contact material for better global friction
        this.world.defaultContactMaterial.friction = 0.8;
        this.world.defaultContactMaterial.restitution = 0.1;
        
        // Fixed timestep for physics (60 Hz)
        this.fixedTimeStep = 1.0 / 60.0;
        this.maxSubSteps = 4;
    }

    update(deltaTime) {
        // Use a maximum time delta to prevent instability after pauses/lag
        const maxDelta = 1/30; // Max 1/30 second (prevents big jumps)
        const clampedDelta = Math.min(deltaTime, maxDelta);
        
        // Step the physics world
        this.world.step(this.fixedTimeStep, clampedDelta, this.maxSubSteps);
        
        // CRITICAL FIX: Only help bodies sleep if they're truly stopped
        // Don't force dynamic objects to sleep as that can prevent vehicle movement
        this.world.bodies.forEach(body => {
            // Skip handling for any non-sleeping body that shouldn't sleep
            if (!body.allowSleep || body.sleepState === CANNON.Body.SLEEPING) {
                return;
            }
            
            // Only zero velocities if truly stationary (very strict check)
            if (body.velocity.lengthSquared() < 0.001 && 
                body.angularVelocity.lengthSquared() < 0.001) {
                body.velocity.setZero();
                body.angularVelocity.setZero();
            }
        });
    }
}

export class Vehicle {
    constructor(physicsWorld, position = new CANNON.Vec3(0, 1, 0)) {
        this.world = physicsWorld.world;
        
        // Adjusted forces for smoother control
        this.maxForce = 500;
        this.maxSteerVal = 0.3; 
        this.maxBrakeForce = 15000;
        
        // Create vehicle chassis with proper dimensions
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2)); // Taller chassis
        this.chassisBody = new CANNON.Body({
            mass: 800,
            position: position,
            shape: chassisShape,
            material: physicsWorld.groundMaterial
        });
        
        // Slightly increased damping for smoother movement
        this.chassisBody.angularDamping = 0.4;
        this.chassisBody.linearDamping = 0.1;
        
        // Disable sleeping for the chassis
        this.chassisBody.allowSleep = false;
        
        // Zero all initial velocity and forces
        this.chassisBody.velocity.set(0, 0, 0);
        this.chassisBody.angularVelocity.set(0, 0, 0);
        this.chassisBody.force.set(0, 0, 0);
        this.chassisBody.torque.set(0, 0, 0);
        
        // Define the vehicle axis configuration
        // This must match how we generate forces and our wheel setup
        // With our coordinate system:
        // - X is right/left (positive is right)
        // - Y is up/down (positive is up)
        // - Z is forward/backward (positive is BACKWARD, negative is FORWARD)
        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0,     // x is right
            indexUpAxis: 1,        // y is up
            indexForwardAxis: 2,   // z axis (negative z is forward)
        });
        
        // Use truly proper wheel options for stable behavior
        const wheelOptions = {
            radius: 0.5,
            directionLocal: new CANNON.Vec3(0, -1, 0), // suspension direction - downward
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 2.0,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: new CANNON.Vec3(-1, 0, 0), // wheel axle along x-axis (left-right)
            chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0), // Will be set for each wheel
            maxSuspensionTravel: 0.3,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Clear wheel positioning with proper distances
        // CRITICAL FIX: Adjust wheel positions to match a realistic car (slightly narrower in Z)
        const wheelPositions = [
            { x: -1, y: 0, z: -1.6 },   // Front left
            { x: 1, y: 0, z: -1.6 },    // Front right
            { x: -1, y: 0, z: 1.6 },    // Rear left
            { x: 1, y: 0, z: 1.6 }      // Rear right
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
        
        // CRITICAL FIX: Create wheel bodies with PROPER ORIENTATION
        // This is the key fix for wheels rotating correctly
        this.vehicle.wheelInfos.forEach((wheel, index) => {
            // Create a properly oriented cylinder for the wheel
            // The cylinder's axis needs to be aligned with the wheel's axle (x-axis)
            const cylinderShape = new CANNON.Cylinder(
                wheel.radius, // top radius
                wheel.radius, // bottom radius
                wheel.radius * 0.5, // height/width of wheel
                20 // number of segments
            );
            
            const wheelBody = new CANNON.Body({
                mass: 0, // Zero mass for kinematic wheels
                material: physicsWorld.wheelMaterial
            });
            
            // CRITICAL FIX: The cylinder's local y-axis needs to be rotated 
            // to match the wheel's axle (which is along the local x-axis)
            const quaternion = new CANNON.Quaternion();
            quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
            
            // Add the shape with the rotation to align it properly
            wheelBody.addShape(cylinderShape, new CANNON.Vec3(), quaternion);
            wheelBody.type = CANNON.Body.KINEMATIC;
            this.wheelBodies.push(wheelBody);
            this.world.addBody(wheelBody);
            
            // Debug confirmation
            console.log(`Wheel ${index} added at position:`, 
                        wheelPositions[index].x, 
                        wheelPositions[index].y, 
                        wheelPositions[index].z);
        });
        
        // Initialize all wheels with zero forces
        this.initWheels();
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
    
    // Apply force in the correct direction
    // With our setup (where negative Z is forward):
    // - Positive force should go backward
    // - Negative force should go forward
    // But we want "accelerate" to mean "go forward", so we'll negate the force
    accelerate(force = this.maxForce) {
        this.chassisBody.wakeUp();
        
        // Apply NEGATIVE force to move forward (in negative Z direction)
        // this effectively reverses the force direction to match our expectations
        const forwardForce = -force; // Negate force to get forward movement
        
        // Apply force primarily to rear wheels (which are at indices 2 and 3)
        this.applyEngineForce(forwardForce * 1.5, 2); // Rear left (more power)
        this.applyEngineForce(forwardForce * 1.5, 3); // Rear right (more power)
        
        // Apply less force to front wheels for stability and traction
        this.applyEngineForce(forwardForce * 0.5, 0); // Front left (less power)
        this.applyEngineForce(forwardForce * 0.5, 1); // Front right (less power)
        
        console.log(`Applying force: ${forwardForce} to rear wheels`);
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
    
    // Completely clear all movement and force vectors during reset
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
    }
} 