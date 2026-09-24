// Items, pickups and first-person weapons. Builders: (opts = {}) => Object3D.
// Pickups lie flat (origin at the bottom centre, collider 'none'). Weapons use
// the weapon frame: origin at the grip, barrel/blade toward -Z, up +Y; see
// ./items/*.js for the exposed moving parts. Implementation lives in ./items/.
import { phone, fuse, crowbar, valveWheel, bandage, note } from './items/pickups.js';
import { cartridge, shell, ammoBox, shells } from './items/ammo.js';
import { knife } from './items/knife.js';
import { revolver } from './items/revolver.js';
import { shotgun } from './items/shotgun.js';
import { fpArm } from './items/arm.js';

export const ITEMS = {
  phone,
  knife,
  revolver,
  shotgun,
  fuse,
  crowbar,
  valveWheel,
  ammoBox,
  shells,
  bandage,
  note,
  cartridge,
  shell,
  fpArm,
};
