import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { clearTrack } from './utils.js';

export const trackInfo = {
    name: "Giant Circle Track",
    description: "A massive circular track with separate start and finish lines",
    bounds: {
        centerX: 0,
        centerZ: 0,
        innerRadius: 300,
        outerRadius: 315
    },
    startPosition: new THREE.Vector3(0, 3.5, -305),
    startRotation: Math.PI / 2
};

export function createCircleTrack(scene, physicsWorld, trackObjects) {
    // Clear any existing track objects first
    clearTrack(scene, trackObjects, physicsWorld, null);
    
    // Track parameters
    const innerRadius = trackInfo.bounds.innerRadius;
    const outerRadius = trackInfo.bounds.outerRadius;
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
    
    // Add start line at 0 degrees position (negative Z axis)
    const startLineWidth = outerRadius - innerRadius;
    const startLinePosition = new THREE.Vector3(0, 0.01, -outerRadius - (startLineWidth / 2));
    const startGeometry = new THREE.PlaneGeometry(startLineWidth, 5);
    trackObjects.startLine = new THREE.Mesh(startGeometry, new THREE.MeshPhongMaterial({ color: 0x00ff00 }));
    trackObjects.startLine.rotation.x = -Math.PI / 2;
    trackObjects.startLine.position.copy(startLinePosition);
    scene.add(trackObjects.startLine);
    
    // Store start line position for debugging
    console.log("Circle track start line position:", startLinePosition.x, startLinePosition.y, startLinePosition.z);
    console.log("Circle track start position:", trackInfo.startPosition.x, trackInfo.startPosition.y, trackInfo.startPosition.z);
    
    // Add finish line at 180 degrees position
    const finishGeometry = new THREE.PlaneGeometry(startLineWidth, 5);
    trackObjects.finishLine = new THREE.Mesh(finishGeometry, new THREE.MeshPhongMaterial({ color: 0xff0000 }));
    trackObjects.finishLine.rotation.x = -Math.PI / 2;
    trackObjects.finishLine.position.set(0, 0.01, outerRadius + (startLineWidth / 2));
    scene.add(trackObjects.finishLine);
    
    // Add directional markers around the track
    const markerCount = 16;
    const markerAngle = (2 * Math.PI) / markerCount;
    
    for (let i = 0; i < markerCount; i++) {
        const angle = i * markerAngle;
        const markerRadius = (innerRadius + outerRadius) / 2;
        
        const x = markerRadius * Math.cos(angle);
        const z = markerRadius * Math.sin(angle);
        
        const arrowGeometry = new THREE.PlaneGeometry(5, 2);
        const arrowMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
        
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.rotation.x = -Math.PI / 2;
        // Point in the direction of travel (tangent to circle)
        arrow.rotation.z = angle + Math.PI / 2;
        arrow.position.set(x, 0.02, z);
        
        scene.add(arrow);
        trackObjects.boundaries.push(arrow);
    }
} 