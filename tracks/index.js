import { createStraightTrack, trackInfo as straightTrackInfo } from './straight.js';
import { createCircleTrack, trackInfo as circleTrackInfo } from './circle.js';
import { createStraightHeightTrack, trackInfo as straightHeightTrackInfo } from './straight_height.js';
import { clearTrack } from './utils.js';

// Export all track creation functions
export { clearTrack };

// Export track definitions
export const tracks = {
    straight: {
        name: straightTrackInfo.name,
        description: straightTrackInfo.description,
        create: createStraightTrack,
        bounds: straightTrackInfo.bounds,
        startPosition: straightTrackInfo.startPosition,
        startRotation: straightTrackInfo.startRotation
    },
    circle: {
        name: circleTrackInfo.name,
        description: circleTrackInfo.description,
        create: createCircleTrack,
        bounds: circleTrackInfo.bounds,
        startPosition: circleTrackInfo.startPosition,
        startRotation: circleTrackInfo.startRotation
    },
    straight_height: {
        name: straightHeightTrackInfo.name,
        description: straightHeightTrackInfo.description,
        create: createStraightHeightTrack,
        bounds: straightHeightTrackInfo.bounds,
        startPosition: straightHeightTrackInfo.startPosition,
        startRotation: straightHeightTrackInfo.startRotation
    }
}; 