# AIGaming Racing - Physics Implementation

This document describes the physics implementation for the AIGaming Racing game. The implementation follows Phase 1 of the MVP2 plan, enhancing the physics for car and track.

## Physics Engine

The game uses **Cannon.js** as its physics engine, providing realistic car dynamics and accurate track interactions.

## Car Physics

### Configuration Parameters

The car's physics is controlled by the following parameters:

```javascript
const physicsConfig = {
    maxSpeed: 200,              // Maximum car speed
    acceleration: 10,           // Car acceleration rate
    brakingForce: 15,           // Car braking force
    emergencyBrakeForce: 30,    // Stronger braking force for space bar
    friction: 0.98,             // Car friction (affects slowdown)
    gravity: -9.81,             // Gravity value
    turnSpeed: 2.5,             // Car turning speed (radians per second)
    surfaceFriction: 0.9,       // Track surface friction
    jumpBoost: 1.2,             // Jump boost factor
    timeStep: 1/60              // Physics simulation time step (60 fps)
};
```

### Car Body

The car is represented by a CANNON.Body with the following properties:

- Mass: 1000 units
- Shape: Box with half-extents (1, 0.5, 2)
- Materials: Custom material with friction properties
- Damping: Linear damping (0.1) and angular damping (0.5) for natural deceleration

### Controls

- **Acceleration**: Applied as a force in the car's local forward direction
- **Braking**: Applied as a force in the car's local backward direction
- **Emergency Brake**: Applied as a stronger force opposite to the car's velocity direction
- **Turning**: Applied as angular velocity to the car's Y-axis
- **Speed Limiting**: Enforced by scaling the velocity vector when it exceeds the maximum speed

## Track Physics

### Ground Bodies

- **Straight Track**: Uses a flat CANNON.Plane for the ground
- **Circle Track**: Uses a cylindrical CANNON.Cylinder for the ring-shaped ground

### Boundary Walls

- **Straight Track**: Box-shaped walls on all four sides
- **Circle Track**: Cylindrical walls for inner and outer boundaries

### Materials and Friction

- Custom materials are used for both ground and car
- Contact material defines how the car interacts with the ground:
  - Friction: 0.9
  - Restitution: 0.3 (slight bounce)

## Special Features

### Jump Ramps

- Jump ramps can be added to tracks using the `addJumpRamp` function
- When the car collides with a ramp, it gets an upward velocity boost
- The boost is scaled by the impact velocity and the jumpBoost factor

### Ground Detection

- Ray casting is used to detect when the car is on the ground
- Visual and gameplay states are updated based on ground contact
- Allows for jump physics and landing effects

### Debug Visualization

- Debug mode can be toggled with the 'D' key
- Shows wireframe representations of all physics bodies
- Helps with tuning physics parameters and debugging collisions

## Physics World Setup

```javascript
const world = new CANNON.World();
world.gravity.set(0, -9.81, 0); // Standard gravity
```

## Implementation Tips

1. **Tuning Physics**: If the car feels too heavy or light, adjust the following:
   - Car mass
   - Force multipliers in the control code
   - Surface friction
   - Linear and angular damping

2. **Adding Track Elements**:
   - All static elements should have mass = 0
   - Ensure collision meshes closely match visual meshes
   - Use appropriate materials for different surfaces

3. **Debugging**:
   - Use the debug visualization mode (D key)
   - Check the console for physics-related events (jumps, collisions)
   - Monitor speed and position data in the on-screen debug info

## Known Issues and Future Enhancements

1. **Collision Detection Improvement**: Currently, some collisions might feel strange due to simple collision shapes. Using compound shapes could improve collision detection.

2. **Suspension Physics**: The car doesn't have proper suspension physics yet, which could be added to improve realism.

3. **Drift Mechanics**: Additional physics tuning could add drift mechanics for more advanced driving techniques.

4. **Surface Types**: Different surface types (ice, dirt, asphalt) could be added by varying the friction properties of track sections. 