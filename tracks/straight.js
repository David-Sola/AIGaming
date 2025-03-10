import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Update trackInfo for a larger, sinusoidal track
export const trackInfo = {
    name: "Optimized Sinus Track",
    description: "A 5x larger track that curves with a sinusoidal shape",
    bounds: {
        left: -500,
        right: 500,
        top: -500,
        bottom: 500
    },
    // Choose a start position near one end of the track after rotation.
    startPosition: new THREE.Vector3(50, 3.5, 450),
    startRotation: -0.7
};
/**
 * Creates a poly track using an extruded shape based on a sinusoidal centerline.
 */
export function createStraightTrack(scene, physicsWorld, trackObjects) {
    // Track parameters
    const trackLength = 1000;  // total length of the track
    const trackWidth = 50;     // width of the track
    const numPoints = 50;      // number of points to define the centerline
    const amplitude = 100;     // amplitude of the sinusoidal curve
    const frequency = (2 * Math.PI) / 500;  // one full cycle every 500 units

    // Generate centerline points along the z axis
    const centerPoints = [];
    for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const z = THREE.MathUtils.lerp(-trackLength / 2, trackLength / 2, t);
        const x = amplitude * Math.sin(frequency * z);
        centerPoints.push(new THREE.Vector2(x, z));
    }

    // Calculate left and right boundaries using tangent and normal vectors
    const leftPoints = [];
    const rightPoints = [];
    for (let i = 0; i < centerPoints.length; i++) {
        const p = centerPoints[i];
        // Compute tangent vector
        let tangent;
        if (i < centerPoints.length - 1) {
            tangent = new THREE.Vector2(centerPoints[i + 1].x - p.x, centerPoints[i + 1].y - p.y);
        } else {
            tangent = new THREE.Vector2(p.x - centerPoints[i - 1].x, p.y - centerPoints[i - 1].y);
        }
        tangent.normalize();
        // Normal vector (perpendicular to tangent)
        const normal = new THREE.Vector2(-tangent.y, tangent.x);
        // Offset boundaries by half the track width
        leftPoints.push(new THREE.Vector2(p.x + normal.x * trackWidth / 2, p.y + normal.y * trackWidth / 2));
        rightPoints.push(new THREE.Vector2(p.x - normal.x * trackWidth / 2, p.y - normal.y * trackWidth / 2));
    }

    // Create a closed shape: traverse the left boundary and then the right boundary in reverse
    const shape = new THREE.Shape();
    shape.moveTo(leftPoints[0].x, leftPoints[0].y);
    leftPoints.forEach(pt => shape.lineTo(pt.x, pt.y));
    for (let i = rightPoints.length - 1; i >= 0; i--) {
        shape.lineTo(rightPoints[i].x, rightPoints[i].y);
    }
    shape.closePath();

    // Extrude the shape to create a 3D track with a small thickness
    const extrudeSettings = {
        steps: 1,
        depth: 0.0001,          // thickness of the track
        bevelEnabled: false
    };
    const trackGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const trackMaterial = new THREE.MeshPhongMaterial({ color: 0x666666, roughness: 0.8 });
    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    // Rotate to lay flat on the XZ plane
    trackMesh.rotation.x = -Math.PI / 2;
    scene.add(trackMesh);
    trackObjects.track = trackMesh;

    // --- Physics ---
    // Convert the extruded geometry into a Cannon-es Trimesh for collision detection.
    const vertices = Array.from(trackGeometry.attributes.position.array);
    let indices = [];
    if (trackGeometry.index) {
        indices = Array.from(trackGeometry.index.array);
    } else {
        indices = [...Array(trackGeometry.attributes.position.count).keys()];
    }
    const trackShapePhysics = new CANNON.Trimesh(vertices, indices);
    const trackBody = new CANNON.Body({
        mass: 0, // static body
        material: physicsWorld.groundMaterial,
    });
    trackBody.addShape(trackShapePhysics);
    trackBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    physicsWorld.world.addBody(trackBody);

    console.log("Poly track created.");
}
