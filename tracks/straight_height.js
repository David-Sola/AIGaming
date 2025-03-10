import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const trackInfo = {
    name: "Downhill Sinus Track",
    description: "A 5x larger track that curves with a sinusoidal shape and slopes downhill.",
    bounds: {
        left: -500,
        right: 500,
        top: -500,
        bottom: 500
    },
    // You may wish to adjust these so the vehicle starts on the uphill end.
    startPosition: new THREE.Vector3(50, 140.5, 450),
    startRotation: -0.7 // Consider offsetting this by the slope angle if needed.
};

export function createStraightHeightTrack(scene, physicsWorld, trackObjects) {
    // Track parameters
    const trackLength = 1000;   // total length of the track
    const trackWidth = 50;      // width of the track
    const numPoints = 50;       // number of points to define the centerline
    const amplitude = 100;      // amplitude of the sinusoidal curve
    const frequency = (2 * Math.PI) / 500;  // one full cycle every 500 units
    const totalDrop = -300;      // total vertical drop over the track length

    // Compute the slope angle (in radians) such that tan(angle)=drop/length.
    const slopeAngle = Math.atan(totalDrop / trackLength); // ≈0.1 rad

    // Generate centerline points along the z axis (2D: x and z)
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
        let tangent;
        if (i < centerPoints.length - 1) {
            tangent = new THREE.Vector2(
                centerPoints[i + 1].x - p.x, 
                centerPoints[i + 1].y - p.y
            );
        } else {
            tangent = new THREE.Vector2(
                p.x - centerPoints[i - 1].x, 
                p.y - centerPoints[i - 1].y
            );
        }
        tangent.normalize();
        // Normal vector is perpendicular to tangent.
        const normal = new THREE.Vector2(-tangent.y, tangent.x);
        // Offset boundaries by half the track width.
        leftPoints.push(new THREE.Vector2(
            p.x + normal.x * trackWidth / 2,
            p.y + normal.y * trackWidth / 2
        ));
        rightPoints.push(new THREE.Vector2(
            p.x - normal.x * trackWidth / 2,
            p.y - normal.y * trackWidth / 2
        ));
    }

    // Create a closed shape by traversing the left boundary and then the right in reverse.
    const shape = new THREE.Shape();
    shape.moveTo(leftPoints[0].x, leftPoints[0].y);
    leftPoints.forEach(pt => shape.lineTo(pt.x, pt.y));
    for (let i = rightPoints.length - 1; i >= 0; i--) {
        shape.lineTo(rightPoints[i].x, rightPoints[i].y);
    }
    shape.closePath();

    // Extrude the shape to create a 3D track.
    // We set a depth of 1 (you can adjust if needed) and disable beveling.
    const extrudeSettings = {
        steps: 20,          // use more steps to get extra vertices for bumping
        depth: 1,           // thickness of the track
        bevelEnabled: false
    };
    const trackGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // ----- Add smooth bumps to the top surface -----
    // In the extruded geometry, the original 2D shape was in the XY plane and was extruded along the Z axis.
    // After extrusion, vertices with a z value close to the extrusion depth (here, 1) form the top surface.
    // We’ll add a periodic offset to those vertices—but only gradually as they approach the top.
    const bumpAmplitude = 1;      // maximum height of the bumps; adjust as desired
    const bumpFrequency = 0.5;   // frequency of bumps along the road
    const topThreshold = 0.95;    // vertices with z > topThreshold will receive bump offsets
    const extrudeDepth = extrudeSettings.depth; // the maximum z value, here 1

    const positions = trackGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const index = i * 3;
        const zValue = positions.array[index + 2];
        // Only modify vertices that are near the top surface.
        if (zValue > topThreshold) {
            // Compute a factor that ramps from 0 to 1 as zValue goes from topThreshold to extrudeDepth.
            let t = (zValue - topThreshold) / (extrudeDepth - topThreshold);
            // Apply a smoothstep function for a smoother transition.
            t = t * t * (3 - 2 * t);
            // Use the vertex's y coordinate (from the original 2D shape) to drive the bump pattern.
            const bump = bumpAmplitude * t * Math.sin(bumpFrequency * positions.array[index + 1]);
            positions.array[index + 2] += bump;
        }
    }
    positions.needsUpdate = true;
// ----- End smooth bump modifications -----


    const trackMaterial = new THREE.MeshPhongMaterial({ color: 0x666666, roughness: 0.8 });
    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);

    // Originally the track is laid flat by rotating -π/2 about x.
    // Now add an extra rotation of "slopeAngle" so that one end is higher.
    trackMesh.rotation.x = -Math.PI / 2 + slopeAngle;
    scene.add(trackMesh);
    trackObjects.track = trackMesh;

    // --- Physics ---
    // Convert the extruded (and bumped) geometry into a Cannon-es Trimesh.
    const vertices = Array.from(trackGeometry.attributes.position.array);
    let indices = [];
    if (trackGeometry.index) {
        indices = Array.from(trackGeometry.index.array);
    } else {
        indices = [...Array(trackGeometry.attributes.position.count).keys()];
    }
    const trackShapePhysics = new CANNON.Trimesh(vertices, indices);

    // Create a static physics body.
    const trackBody = new CANNON.Body({
        mass: 0, // static body
        material: physicsWorld.groundMaterial,
    });

    // Instead of setting the body's quaternion after adding the shape,
    // add the shape with the rotation already applied.
    const shapeOrientation = new CANNON.Quaternion();
    shapeOrientation.setFromEuler(-Math.PI / 2 + slopeAngle, 0, 0);
    trackBody.addShape(trackShapePhysics, new CANNON.Vec3(), shapeOrientation);

    // Add the body to the physics world.
    physicsWorld.world.addBody(trackBody);

    console.log("Downhill sinus track with bumps created.");
}
