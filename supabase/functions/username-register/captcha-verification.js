/** Separate, easily tested business checks for Cloudflare Siteverify responses.
 * A success flag by itself is insufficient: a token for a different hostname
 * or action must not authorize account creation.
 */
export function acceptedSignupChallenge(value,hostname){
 return !!value&&value.success===true&&
  value.hostname===hostname&&value.action==='username-register';
}
export function validCaptchaToken(value){
 return typeof value==='string'&&value.length>=1&&value.length<=2048;
}
