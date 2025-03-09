import * as THREE from 'three';

export class VehicleVisual {
    constructor(scene) {
        this.scene = scene;
        this.meshes = {
            chassis: null,
            wheels: []
        };
        
        this.createChassis();
        this.createWheels();
    }

    createChassis() {
        // CRITICAL FIX: Create a better visual chassis that shows the front/back of the car
        const geometry = new THREE.BoxGeometry(2, 1, 4); // Match physics dimensions
        const material = new THREE.MeshPhongMaterial({
            color: 0x990000,
            specular: 0x333333,
            shininess: 30
        });
        
        this.meshes.chassis = new THREE.Mesh(geometry, material);
        
        // Add a visual indicator for the front of the car
        const frontGeometry = new THREE.BoxGeometry(1.8, 0.4, 0.5);
        const frontMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const frontIndicator = new THREE.Mesh(frontGeometry, frontMaterial);
        frontIndicator.position.set(0, 0, -1.8); // Place at the front
        this.meshes.chassis.add(frontIndicator);
        
        this.scene.add(this.meshes.chassis);
    }

    createWheels() {
        // CRITICAL FIX: Create better wheel visualization
        // Create a wheel geometry that clearly shows rotation direction
        const wheelRadius = 0.5;
        const wheelThickness = 0.4;
        
        // Create wheel geometry
        const wheelGeometry = new THREE.CylinderGeometry(
            wheelRadius,     // top radius
            wheelRadius,     // bottom radius
            wheelThickness,  // height
            24,              // radial segments
            1,               // height segments
            false            // open-ended
        );
        
        // Create wheel material with a pattern to show rotation
        const wheelMaterial = new THREE.MeshPhongMaterial({
            color: 0x222222,
            specular: 0x444444,
            shininess: 30
        });
        
        // Material for the wheel pattern
        const patternMaterial = new THREE.MeshPhongMaterial({
            color: 0x888888,
            specular: 0x444444,
            shininess: 20
        });

        // CRITICAL FIX: Rotate the wheel geometry to match the physics model
        // The cylinder needs to be rotated to align with the car's wheel axles
        wheelGeometry.rotateZ(Math.PI / 2); // Rotate to align with car's x-axis

        // Create four wheels with indicators to see rotation
        for (let i = 0; i < 4; i++) {
            // Create the wheel mesh
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            
            // Add a spoke pattern to visualize rotation
            const spokeGeometry = new THREE.BoxGeometry(wheelThickness * 0.8, 0.1, 0.1);
            const spoke = new THREE.Mesh(spokeGeometry, patternMaterial);
            spoke.position.set(0, wheelRadius * 0.5, 0);
            wheel.add(spoke);
            
            // Add a second spoke perpendicular to the first
            const spoke2 = new THREE.Mesh(spokeGeometry, patternMaterial);
            spoke2.rotation.set(0, 0, Math.PI/2);
            spoke2.position.set(0, 0, wheelRadius * 0.5);
            wheel.add(spoke2);
            
            this.meshes.wheels.push(wheel);
            this.scene.add(wheel);
        }
    }

    update(chassisBody, wheelBodies) {
        // Update chassis
        this.meshes.chassis.position.copy(chassisBody.position);
        this.meshes.chassis.quaternion.copy(chassisBody.quaternion);

        // Update wheels
        for (let i = 0; i < this.meshes.wheels.length; i++) {
            this.meshes.wheels[i].position.copy(wheelBodies[i].position);
            this.meshes.wheels[i].quaternion.copy(wheelBodies[i].quaternion);
        }
    }

    reset() {
        // Reset all meshes to default positions
        this.meshes.chassis.position.set(0, 1, 0);
        this.meshes.chassis.quaternion.set(0, 0, 0, 1);
        
        // CRITICAL FIX: Reset wheel positions to match physics model
        const wheelPositions = [
            { x: -1, y: 0.5, z: -1.6 }, // Front left
            { x: 1, y: 0.5, z: -1.6 },  // Front right
            { x: -1, y: 0.5, z: 1.6 },  // Back left
            { x: 1, y: 0.5, z: 1.6 }    // Back right
        ];
        
        wheelPositions.forEach((pos, i) => {
            this.meshes.wheels[i].position.set(pos.x, pos.y, pos.z);
            this.meshes.wheels[i].quaternion.set(0, 0, 0, 1);
        });
    }
} 