import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { clearTrack } from './utils.js';

export const trackInfo = {
    name: "Straight Track",
    description: "A simple straight track with a start and finish line",
    bounds: {
        left: -5,
        right: 5,
        top: -24.5,
        bottom: 24.5
    },
    startPosition: new THREE.Vector3(0, 1.5, 24),
    startRotation: 0
};

export function createStraightTrack(scene, physicsWorld, trackObjects) {
    // Clear any existing track objects first
    clearTrack(scene, trackObjects, physicsWorld, null);
    
    // Create a wider and longer track
    const trackGeometry = new THREE.PlaneGeometry(20, 100); // Wider and longer
    trackObjects.track = new THREE.Mesh(trackGeometry, new THREE.MeshPhongMaterial({ 
        color: 0x666666, // Darker color
        roughness: 0.8, // Add roughness for better visual indication of surface
    }));
    trackObjects.track.rotation.x = -Math.PI / 2;
    trackObjects.track.receiveShadow = true;
    scene.add(trackObjects.track);
    
    // Add track to physics world with proper dimensions and position
    // Using a box instead of a plane for better collision detection
    const groundShape = new CANNON.Box(new CANNON.Vec3(10, 0.1, 50)); // Half-extents
    const groundBody = new CANNON.Body({
        mass: 0, // Static body
        shape: groundShape,
        material: physicsWorld.groundMaterial,
        position: new CANNON.Vec3(0, -0.1, 0) // Slightly below y=0 to ensure good contact
    });
    physicsWorld.world.addBody(groundBody);
    
    // Add walls to prevent falling off the track
    // Left wall
    const leftWallShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 50));
    const leftWallBody = new CANNON.Body({
        mass: 0,
        shape: leftWallShape,
        position: new CANNON.Vec3(-10.5, 1, 0)
    });
    physicsWorld.world.addBody(leftWallBody);
    
    // Right wall
    const rightWallShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 50));
    const rightWallBody = new CANNON.Body({
        mass: 0,
        shape: rightWallShape,
        position: new CANNON.Vec3(10.5, 1, 0)
    });
    physicsWorld.world.addBody(rightWallBody);
    
    // Create start line
    const startLinePosition = new THREE.Vector3(0, 0.01, 14);
    const startGeometry = new THREE.PlaneGeometry(20, 1); // Match track width
    trackObjects.startLine = new THREE.Mesh(startGeometry, new THREE.MeshPhongMaterial({ color: 0x00ff00 }));
    trackObjects.startLine.rotation.x = -Math.PI / 2;
    trackObjects.startLine.position.copy(startLinePosition);
    scene.add(trackObjects.startLine);
    
    // Store start line position for debugging
    console.log("Straight track start line position:", startLinePosition.x, startLinePosition.y, startLinePosition.z);
    console.log("Straight track start position:", trackInfo.startPosition.x, trackInfo.startPosition.y, trackInfo.startPosition.z);
    
    // Create better visual walls to match the physics walls
    const wallMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    
    // Left wall visual
    const leftWallGeometry = new THREE.BoxGeometry(1, 2, 100);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.set(-10.5, 1, 0);
    scene.add(leftWall);
    trackObjects.barriers.push(leftWall);
    
    // Right wall visual
    const rightWallGeometry = new THREE.BoxGeometry(1, 2, 100);
    const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
    rightWall.position.set(10.5, 1, 0);
    scene.add(rightWall);
    trackObjects.barriers.push(rightWall);
    
    // Add directional markings on track to show direction
    const arrowGeometry = new THREE.PlaneGeometry(5, 2);
    const arrowMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
    
    for (let z = 20; z >= -40; z -= 10) {
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = Math.PI; // Point in the forward direction
        arrow.position.set(0, 0.02, z);
        scene.add(arrow);
        trackObjects.boundaries.push(arrow);
    }
} 