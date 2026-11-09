/** V2 Phase 2 public interfaces; no legacy imports or live activation. */
export {createMovementController} from './MovementController.js';
export {createInputController} from './InputController.js';
export {gridPoint,appendGestureBend,takeGestureBatch,expandGestureRoute,
 MAX_GESTURE_BENDS,MAX_BATCH_CELLS,MAX_BATCH_TARGETS} from './GesturePath.js';

export {compileCollisionScene,solveCollisionPath,collisionAllowsStep}
 from './CollisionSolver.js';
export {sweptFootprintHull,segmentCrossesSweptFootprint}
 from './CollisionGeometry.js';
export {createCollisionPredictor} from './CollisionPreflight.js';

export {createWorldAuthorityClient} from './AuthorityClient.js';

export {createWorldRealtimeTransport,worldObserverTopic,validWorldMotionFrame,
 validWorldObserverSnapshot,WORLD_MOTION_EVENT}
 from './RealtimeTransport.js';
