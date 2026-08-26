# Toy models

Drop a `.glb` here and the scene picks it up: no code change. Each file replaces one
primitive stand-in that is drawn until the model reports loaded. If a file is missing the
stand-in simply stays, so the scene never breaks on an absent model.

## Contract

- The model is a child of the stand-in at identity, so author it to the stand-in's box:
  a unit cube, origin at its centre, Y up, for anything listed at 1 m below. The code keeps
  scaling the entity exactly as it scales the box today.
- Colliders stay on the stand-in. Export with no collider meshes.
- No textures needed: flat vertex or material colours, `metallic 0`, plastic. The scene sets
  no material on the model, so bake the colour into the GLB.
- Budget: an item model is drawn up to 72 times per base and 60 bases share it. Keep every
  `item-*.glb` under 150 triangles. Venue pieces exist once and may be richer.

## Files the scene looks for

| file | stand-in it replaces | authored size |
|---|---|---|
| `item-0.glb` .. `item-6.glb` | the exposed item, one per rarity (Common .. Secret) | unit cube |
| `sentry.glb` | the per-floor turret | cylinder r 0.25, h 0.45 |

More mount points are added by calling `montable(entity, 'file.glb')` in the client.
