/**
 * The verb the contextual button offers right now, named once for the whole scene.
 *
 * Ground markers must obey the button, not their own conditions. While each decided on its
 * own, two green ghosts could show at once with no way to tell which one the tap would serve
 * (owner, 1 Sep). `nextAction()` is the single arbiter, with its priority list; it writes its
 * choice here and the markers read it. A visible marker therefore means exactly: pressing does
 * THIS.
 */
export const verb: { id: string } = { id: '' }
