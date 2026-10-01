/**
 * The draw.io viewer cantip serves itself. The generator downloads this release
 * into `public/` and the image view loads it from there, so both must use the
 * same version and path.
 */
export const DRAWIO_VERSION = '31.5.3'

export const DRAWIO_BASE_PATH = `/_drawio/${DRAWIO_VERSION}`
