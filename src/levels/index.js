import field from './field.js';
import ground from './ground.js';
import upstairs from './upstairs.js';
import basement from './basement.js';
import cistern from './cistern.js';
import caves from './caves.js';
import heart from './heart.js';

// Play order. Each module: { id, name, subtitle?, zone, build(L, game), prepare?(game) }
export const LEVELS = [field, ground, upstairs, basement, cistern, caves, heart];
