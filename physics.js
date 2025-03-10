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
        this.world.solver.iterations = 60;
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
                friction: 1.5, // Increased for better grip on slopes
                restitution: 0.005, // Further reduced for less bouncing on height changes
                contactEquationStiffness: 800, // Reduced for smoother transitions over track curves
                contactEquationRelaxation: 4.0, // Increased for smoother response
                frictionEquationStiffness: 800, // Matches contact equation stiffness
                frictionEquationRelaxation: 3.0, // Added for more consistent friction response
            }
        );
        this.world.addContactMaterial(wheelGroundContact);

        // Global contact material settings (lower friction for less abrupt stops)
        this.world.defaultContactMaterial.friction = 0.3; // Slightly increased for more realistic physics
        this.world.defaultContactMaterial.restitution = 0.02;

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
        this.maxForce = 6000; // Reduced max force to prevent instant full power application
        this.maxSteerVal = 0.7;
        this.maxBrakeForce = 6000; // Lowered brake force for more controlled deceleration

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
        this.chassisBody.linearDamping = 0.02; // Increased linear damping for more resistance
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

        // Wheel options with updated suspension and damping settings for smoother behavior
        const wheelOptions = {
            radius: 0.7,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 25, // Reduced suspension stiffness for a softer ride
            suspensionRestLength: 0.4, // Increased for better suspension travel
            frictionSlip: 3.0, // Reduced for better control on slopes
            dampingRelaxation: 2.0, // Lowered for smoother behavior
            dampingCompression: 3.5, // Lowered for less bouncing
            maxSuspensionForce: 50000, // Reduced for better stability on slopes
            rollInfluence: 0.02, // Reduced for more lateral stability
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
            maxSuspensionTravel: 0.7, // Increased for better handling of height changes
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Define wheel positions for stability
        const wheelPositions = [
            { x: -2, y: -1.5, z: -3.9 },   // Front left
            { x: 2, y: -1.5, z: -3.9 },    // Front right
            { x: -2, y: -1.5, z: 2 },      // Rear left
            { x: 2, y: -1.5, z: 2 }        // Rear right
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
        const upAxis = new CANNON.Vec3(0, 1, 0);
        const chassisUp = new CANNON.Vec3();
        this.chassisBody.quaternion.vmult(upAxis, chassisUp);
        const slopeFactor = chassisUp.dot(upAxis);

        const forwardAxis = new CANNON.Vec3(0, 0, -1); // z is forward axis
        const chassisForward = new CANNON.Vec3();
        this.chassisBody.quaternion.vmult(forwardAxis, chassisForward);

        const horizontalForward = new CANNON.Vec3(chassisForward.x, 0, chassisForward.z).unit();
        const gravity = new CANNON.Vec3(0, -1, 0);

        const slopeDirection = horizontalForward.dot(
            new CANNON.Vec3(0, chassisUp.y < 0 ? -chassisUp.y : chassisUp.y, 0)
        );

        // Adjust force based on slope
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
        const upAxis = new CANNON.Vec3(0, 1, 0);
        const chassisUp = new CANNON.Vec3();
        this.chassisBody.quaternion.vmult(upAxis, chassisUp);
        const slopeFactor = chassisUp.dot(upAxis);
        const adjustedForce = force * (2 - slopeFactor);
        this.setBrake(adjustedForce);
    }

    steer(steerValue) {
        this.chassisBody.wakeUp();
        const clampedSteer = Math.max(-this.maxSteerVal, Math.min(this.maxSteerVal, steerValue));
        this.setSteeringValue(clampedSteer, 0);
        this.setSteeringValue(clampedSteer, 1);
    }

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
