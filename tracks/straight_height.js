import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { clearTrack } from './utils.js';

export const trackInfo = {
    name: "Sinusoidal Track",
    description: "A track with a sinusoidal height profile featuring hills and valleys",
    bounds: {
        left: -5,
        right: 5,
        top: -24.5,
        bottom: 24.5
    },
    startPosition: new THREE.Vector3(0, 10.5, 14),
    startRotation: 0
};

export function createStraightHeightTrack(scene, physicsWorld, trackObjects) {
    // Clear any existing track objects first
    clearTrack(scene, trackObjects, physicsWorld, null);
    
    // Parameters for the track dimensions and sinusoidal profile
    const segmentsX = 100;
    const segmentsY = 2000;
    const width = 20;
    const height = 100;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const amplitude = 2;     // Reduced from 0.01 for gentler hills
    const frequency = 0.1;         // Reduced from 10 for longer, more gradual waves

    // -------------------------------
    // Create visual track with sinusoidal height profile
    // -------------------------------
    // Create a plane geometry with sufficient subdivisions
    const trackGeometry = new THREE.PlaneGeometry(width, height, segmentsX, segmentsY);
    // Rotate the plane so that it lies in the xz plane (y becomes vertical)
    trackGeometry.rotateX(-Math.PI / 2);
    
    // Modify the geometry's vertices to add the sinusoidal profile.
    // After rotation, each vertex is of the form (x, 0, z). We now displace y based on z.
    const positionAttribute = trackGeometry.attributes.position;
    for (let i = 0; i < positionAttribute.count; i++) {
        const z = positionAttribute.getZ(i);
        const displacement = amplitude * Math.sin(frequency * z);
        positionAttribute.setY(i, displacement);
    }
    positionAttribute.needsUpdate = true;
    trackGeometry.computeVertexNormals();
    
    // Create the visual mesh
    trackObjects.track = new THREE.Mesh(trackGeometry, new THREE.MeshPhongMaterial({ 
        color: 0x666666, 
        roughness: 0.8,
    }));
    trackObjects.track.receiveShadow = true;
    scene.add(trackObjects.track);
    
    // -------------------------------
    // Create physics ground using multiple segments that follow the sine curve
    // -------------------------------
    // We'll use trimesh for better approximation of the sinusoidal shape
    // Define a grid of points for our trimesh
    const trimeshResolution = {
        x: 20,    // number of points across width
        z: 2000    // number of points along length
    };
    
    // Create arrays to hold vertices and indices
    const vertices = [];
    const indices = [];
    
    // Add vertices
    for (let iz = 0; iz <= trimeshResolution.z; iz++) {
        for (let ix = 0; ix <= trimeshResolution.x; ix++) {
            // Calculate position
            const x = -halfWidth + ix * (width / trimeshResolution.x);
            const z = -halfHeight + iz * (height / trimeshResolution.z);
            
            // Calculate height using sinusoidal function
            const y = amplitude * Math.sin(frequency * z);
            
            // Add vertex
            vertices.push(x, y, z);
        }
    }
    
    // Add indices to create triangles
    for (let iz = 0; iz < trimeshResolution.z; iz++) {
        for (let ix = 0; ix < trimeshResolution.x; ix++) {
            // Calculate indices of the 4 corners of a grid cell
            const bottomLeft = iz * (trimeshResolution.x + 1) + ix;
            const bottomRight = bottomLeft + 1;
            const topLeft = (iz + 1) * (trimeshResolution.x + 1) + ix;
            const topRight = topLeft + 1;
            
            // Add two triangles to form a quad
            indices.push(bottomLeft, topLeft, bottomRight);
            indices.push(bottomRight, topLeft, topRight);
        }
    }
    
    // Create the trimesh
    const trimeshShape = new CANNON.Trimesh(vertices, indices);
    const trimeshBody = new CANNON.Body({
        mass: 0,
        material: physicsWorld.groundMaterial
    });
    trimeshBody.addShape(trimeshShape);
    physicsWorld.world.addBody(trimeshBody);
    trackObjects.groundBodies = [trimeshBody]; // Store for potential access later
    
    // For backup, we'll also create a set of box segments that follow the curve more closely
    // but we'll use many more segments for a smoother approximation
    const segments = 200; // Doubled from 100 for smoother approximation
    const segmentLength = height / segments;
    const trackBodies = [];
    
    for (let i = 0; i < segments; i++) {
        // Calculate z position of this segment
        const zPos = -halfHeight + (i + 0.5) * segmentLength;
        
        // Calculate height (y) at this z position using sine function
        const yPos = amplitude * Math.sin(frequency * zPos);
        
        // Calculate the rotation angle based on the derivative of sine function
        const slopeDerivative = amplitude * frequency * Math.cos(frequency * zPos);
        const angle = -Math.atan(slopeDerivative);
        
        // Create a box shape for this segment
        // Use shorter segments for better curve following
        const boxHeight = 0.2; // Thinner boxes overall
        const segmentShape = new CANNON.Box(new CANNON.Vec3(halfWidth, boxHeight, segmentLength / 2));
        
        // Position correction for proper alignment with the sine curve
        const yOffset = boxHeight * Math.cos(angle);
        
        // Create smaller box bodies with more overlap for smoother transitions
        const segmentBody = new CANNON.Body({
            mass: 0,
            material: physicsWorld.groundMaterial,
            position: new CANNON.Vec3(0, yPos - yOffset, zPos)
        });
        
        // Set rotation to match the slope
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), angle);
        segmentBody.quaternion.copy(quaternion);
        
        // Add the shape and the body to the world
        segmentBody.addShape(segmentShape);
        
        // Add more overlap between segments
        const overlapFactor = 1.1; // Consistent larger overlap
        segmentShape.halfExtents.z = (segmentLength / 2) * overlapFactor;
        
        // Apply friction adjustment based on slope for better handling
        const slopeSteepness = Math.abs(slopeDerivative);
        if (slopeSteepness > 0.1) {
            // Apply more friction on steeper segments to prevent sliding
            segmentBody.material = new CANNON.Material({friction: 1.0});
        }
        
        physicsWorld.world.addBody(segmentBody);
        trackBodies.push(segmentBody);
    }
    
    // Add the box bodies to our ground bodies array
    trackObjects.groundBodies = trackObjects.groundBodies.concat(trackBodies);
    
    // -------------------------------
    // Add sinusoidal walls to prevent falling off the track
    // -------------------------------
    // Create barriers that follow the sinusoidal shape
    
    // Number of wall segments to create for each side
    const wallSegments = 30;
    const wallSegmentLength = height / wallSegments;
    
    // Arrays to store the barrier bodies
    const leftWallBodies = [];
    const rightWallBodies = [];
    
    // Create segmented barriers that follow the sine curve
    for (let i = 0; i < wallSegments; i++) {
        // Calculate z position of this wall segment
        const zPos = -halfHeight + (i + 0.5) * wallSegmentLength;
        
        // Calculate height (y) at this z position using sine function
        const yPos = amplitude * Math.sin(frequency * zPos);
        
        // Calculate the rotation angle based on the sine curve slope
        const nextZ = zPos + 0.01;
        const nextY = amplitude * Math.sin(frequency * nextZ);
        const angle = -Math.atan2(nextY - yPos, 0.01);
        
        // Create quaternion for rotation
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), angle);
        
        // Left wall segment
        const leftWallShape = new CANNON.Box(new CANNON.Vec3(0.5, 1.5, wallSegmentLength / 2));
        const leftWallBody = new CANNON.Body({
            mass: 0,
            shape: leftWallShape,
            position: new CANNON.Vec3(-halfWidth - 0.5, yPos + 1.5, zPos)
        });
        leftWallBody.quaternion.copy(quaternion);
        physicsWorld.world.addBody(leftWallBody);
        leftWallBodies.push(leftWallBody);
        
        // Right wall segment
        const rightWallShape = new CANNON.Box(new CANNON.Vec3(0.5, 1.5, wallSegmentLength / 2));
        const rightWallBody = new CANNON.Body({
            mass: 0,
            shape: rightWallShape,
            position: new CANNON.Vec3(halfWidth + 0.5, yPos + 1.5, zPos)
        });
        rightWallBody.quaternion.copy(quaternion);
        physicsWorld.world.addBody(rightWallBody);
        rightWallBodies.push(rightWallBody);
        
        // Create visual meshes for the wall segments
        const wallMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc });
        
        // Left wall visual segment
        const leftWallGeometry = new THREE.BoxGeometry(1, 3, wallSegmentLength);
        const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
        leftWall.position.copy(new THREE.Vector3(-halfWidth - 0.5, yPos + 1.5, zPos));
        // Apply rotation
        leftWall.quaternion.set(
            quaternion.x,
            quaternion.y,
            quaternion.z,
            quaternion.w
        );
        scene.add(leftWall);
        trackObjects.barriers.push(leftWall);
        
        // Right wall visual segment
        const rightWallGeometry = new THREE.BoxGeometry(1, 3, wallSegmentLength);
        const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
        rightWall.position.copy(new THREE.Vector3(halfWidth + 0.5, yPos + 1.5, zPos));
        // Apply rotation
        rightWall.quaternion.set(
            quaternion.x,
            quaternion.y,
            quaternion.z,
            quaternion.w
        );
        scene.add(rightWall);
        trackObjects.barriers.push(rightWall);
    }
    
    // -------------------------------
    // Create start line
    // -------------------------------
    const startLinePosition = new THREE.Vector3(0, 0.01, 14);
    const startGeometry = new THREE.PlaneGeometry(width, 1);
    trackObjects.startLine = new THREE.Mesh(startGeometry, new THREE.MeshPhongMaterial({ color: 0x00ff00 }));
    trackObjects.startLine.rotation.x = -Math.PI / 2;
    
    // Adjust the y position of the start line to match the sine curve
    const startLineZ = startLinePosition.z;
    const startLineY = amplitude * Math.sin(frequency * startLineZ) + 0.01;
    startLinePosition.y = startLineY;
    
    trackObjects.startLine.position.copy(startLinePosition);
    scene.add(trackObjects.startLine);
    
    // Adjust the starting position y-coordinate to match the sine curve
    trackInfo.startPosition.y = startLineY + 0.5; // Add a small offset for the car height
    
    console.log("Sinusoidal track start line position:", startLinePosition.x, startLinePosition.y, startLinePosition.z);
    console.log("Sinusoidal track start position:", trackInfo.startPosition.x, trackInfo.startPosition.y, trackInfo.startPosition.z);
    
    // -------------------------------
    // Add directional markings on track to show direction
    // -------------------------------
    const arrowGeometry = new THREE.PlaneGeometry(5, 2);
    const arrowMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
    
    for (let z = 20; z >= -40; z -= 10) {
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = Math.PI; // Point in the forward direction
        
        // Position the arrow on the sine curve
        const arrowY = amplitude * Math.sin(frequency * z) + 0.02;
        arrow.position.set(0, arrowY, z);
        
        // Calculate the rotation to match the slope
        const nextZ = z + 0.1;
        const nextY = amplitude * Math.sin(frequency * nextZ);
        const angle = Math.atan2(nextY - arrowY, 0.1);
        arrow.rotation.x = -Math.PI/2 + angle;
        
        scene.add(arrow);
        trackObjects.boundaries.push(arrow);
    }
}
