// Track utilities

/**
 * Clears all track objects from the scene and physics world
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {Object} trackObjects - Container for all track-related objects
 * @param {Object} physicsWorld - The physics world
 * @param {Object|null} vehicle - The player's vehicle or null if not yet created
 */
export function clearTrack(scene, trackObjects, physicsWorld, vehicle) {
    // Remove track objects from scene
    if (trackObjects.track) scene.remove(trackObjects.track);
    if (trackObjects.startLine) scene.remove(trackObjects.startLine);
    if (trackObjects.finishLine) scene.remove(trackObjects.finishLine);
    
    trackObjects.boundaries.forEach(boundary => scene.remove(boundary));
    trackObjects.barriers.forEach(barrier => scene.remove(barrier));
    
    trackObjects.boundaries = [];
    trackObjects.barriers = [];
    
    // Clear physics world (except vehicle)
    if (physicsWorld && physicsWorld.world) {
        const bodiesToRemove = [];
        physicsWorld.world.bodies.forEach(body => {
            // Skip vehicle bodies if a vehicle exists
            if (vehicle && (body === vehicle.chassisBody || vehicle.wheelBodies.includes(body))) {
                return;
            }
            bodiesToRemove.push(body);
        });
        bodiesToRemove.forEach(body => physicsWorld.world.removeBody(body));
    }
} 