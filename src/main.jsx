import './style.css';
import './map-environment.css';
import './combat.css';
import React from 'react';
import {createRoot} from 'react-dom/client';
import TabletopApp from './TabletopApp.jsx';
import {AppErrorBoundary} from './AppBoundaries.jsx';

// Bootstrap only: campaign orchestration, map controls and sheet designer are
// independently maintained without changing game-state contracts.
createRoot(document.getElementById('root')).render(
 <AppErrorBoundary><TabletopApp/></AppErrorBoundary>
);
