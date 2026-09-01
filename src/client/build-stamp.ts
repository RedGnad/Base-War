/**
 * Which build you are looking at, written by tools/deploy.sh before every build.
 *
 * The world pointer is cached for minutes after an upload and the launcher refocuses a
 * running Explorer instead of restarting it, so "nothing has changed" is ambiguous by
 * construction: the code may be wrong, or the client may simply be showing the previous
 * version. Two hours of this argument (1 Sep) is what this four-character string ends. It
 * costs a corner of the menu header and settles the question before anyone opens a file.
 */
export const BUILD = 'dev'
