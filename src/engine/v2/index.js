/** World Engine V2 exports. No legacy movement/fog imports. */
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

export {createWorldRealtimeTransport,worldObserverTopic,fetchWorldObserverCursorV2,
 validWorldMotionFrame,
 validWorldObserverSnapshot,WORLD_MOTION_EVENT}
 from './RealtimeTransport.js';

export {createObserverPathBuffer} from './ObserverPathBuffer.js';

export {createSceneSpatialIndex} from './SceneSpatialIndex.js';
export {normalizeWorldSceneSnapshot,worldSceneDirtyRegions}
 from './SceneSnapshot.js';
export {createSceneManager,fetchWorldSceneV2} from './SceneManager.js';
export {createSceneTransport,worldSceneTopic,WORLD_SCENE_EVENT}
 from './SceneTransport.js';

export {normalizeWorldVisibilityFrame,makeWorldFogMask,
 diffWorldFogMasks,diffWorldVisiblePieces,fogEdgeWeight}
 from './VisibilityFrame.js';
export {createVisibilityController,WORLD_VISION_EVENT}
 from './VisibilityController.js';

export {createWorldFrameScheduler} from './WorldFrameScheduler.js';
export {paintWorldFogLayer,paintWorldStaticLayer} from './WorldLayerPainter.js';
export {createWorldRenderer} from './WorldRenderer.js';
