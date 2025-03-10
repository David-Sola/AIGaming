import * as THREE from 'three';
import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';

export class VehicleVisual {
    constructor(scene) {
        this.scene = scene;
        this.meshes = {
            chassis: null,
            wheels: []
        };
        this.modelLoaded = false;
        
        // Create a loading manager to track progress
        this.loadingManager = new THREE.LoadingManager();
        this.loadingManager.onProgress = (url, loaded, total) => {
            console.log(`Loading model... ${(loaded / total * 100)}%`);
        };
        
        // Initialize with temporary box while model loads
        this.createTemporaryChassis();
        this.createWheels();
        
        // Load the Audi R8 model
        this.loadAudiR8Model();
    }

    createTemporaryChassis() {
        // Temporary box geometry while model loads
        const geometry = new THREE.BoxGeometry(2, 1, 4);
        const material = new THREE.MeshPhongMaterial({
            color: 0x990000,
            visible: false // Hide the temporary chassis
        });
        this.meshes.chassis = new THREE.Mesh(geometry, material);
        this.scene.add(this.meshes.chassis);
    }

    async loadAudiR8Model() {
        const loader = new GLTFLoader(this.loadingManager);
        
        try {
            // You'll need to provide the correct path to your Audi R8 model
            const gltf = await loader.loadAsync('Vehicles/AudiR8/scene.gltf');
            
            // Remove the temporary chassis
            if (this.meshes.chassis) {
                this.scene.remove(this.meshes.chassis);
            }
            
            // Set up the loaded model
            this.meshes.chassis = gltf.scene;
            
            // Scale the model to match physics dimensions (adjust these values based on your model)
            this.meshes.chassis.scale.set(0.15, 0.2, 0.15);
            
            // Store the model's original rotation as its base orientation
            // This will be used in the update method
            this.modelBaseRotation = new THREE.Euler(0, Math.PI, 0, 'XYZ');
            this.meshes.chassis.rotation.copy(this.modelBaseRotation);
            
            // Center the model based on its bounding box
            const bbox = new THREE.Box3().setFromObject(this.meshes.chassis);
            const center = bbox.getCenter(new THREE.Vector3());
            this.meshes.chassis.position.sub(center);
            
            // Add model to scene
            this.scene.add(this.meshes.chassis);
            
            // Apply some nice materials and lighting setup for the car
            this.meshes.chassis.traverse((child) => {
                if (child.isMesh) {
                    // Enable shadows
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // If the mesh has a material, enhance it
                    if (child.material) {
                        child.material.envMapIntensity = 1.5;
                        child.material.needsUpdate = true;
                    }
                }
            });
            
            this.modelLoaded = true;
            console.log('Audi R8 model loaded successfully');
            
        } catch (error) {
            console.error('Error loading Audi R8 model:', error);
            // Keep the temporary chassis visible if model loading fails
            if (this.meshes.chassis) {
                this.meshes.chassis.material.visible = true;
            }
        }
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
        // Update chassis position and rotation
        if (this.meshes.chassis) {
            // Copy the physics body position
            this.meshes.chassis.position.copy(chassisBody.position);
            
            // Apply the physics body rotation
            this.meshes.chassis.quaternion.copy(chassisBody.quaternion);
            
            // Apply the base model rotation to correct orientation
            // Convert the model's base rotation to quaternion and multiply
            if (this.modelBaseRotation) {
                const baseRotationQuat = new THREE.Quaternion().setFromEuler(this.modelBaseRotation);
                this.meshes.chassis.quaternion.multiply(baseRotationQuat);
            }
        }

        // Update wheels
        for (let i = 0; i < this.meshes.wheels.length; i++) {
            this.meshes.wheels[i].position.copy(wheelBodies[i].position);
            this.meshes.wheels[i].quaternion.copy(wheelBodies[i].quaternion);
        }
    }

    reset() {
        // Reset chassis position and rotation
        if (this.meshes.chassis) {
            this.meshes.chassis.position.set(0, 1, 0);
            this.meshes.chassis.quaternion.set(0, 0, 0, 1);
        }
        
        // Reset wheel positions to match physics model
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