/** Login handles use Supabase's existing account-name policy. */
export const ACCOUNT_USERNAME=/^[a-z][a-z0-9_]{2,23}$/;
export const VIRTUAL_ACCOUNT_DOMAIN='accounts.tabletopforge.example.com';
export const normalizeAccountUsername=value=>String(value||'').trim().toLowerCase();
export const isNativeUsernameAccount=user=>
 typeof user?.email==='string'&&user.email.toLowerCase().endsWith('@'+VIRTUAL_ACCOUNT_DOMAIN);
export function validateAccountUsername(input){
 const name=normalizeAccountUsername(input);
 if(!ACCOUNT_USERNAME.test(name))
  throw Error('Usernames must be 3–24 characters, beginning with a letter and using only letters, numbers or underscores.');
 return name;
}
export function validateAccountPassword(password,confirmation,username=''){
 if(typeof password!=='string'||password.length<10||password.length>128)
  throw Error('Use a password of 10–128 characters.');
 if(password!==confirmation)throw Error('New passwords do not match.');
 if(username&&password.toLowerCase().includes(normalizeAccountUsername(username)))
  throw Error('Do not include your username in your password.');
 return password;
}
export const accountDisplayName=user=>String(
 user?.user_metadata?.username||user?.user_metadata?.display_name||
 user?.email?.split('@')[0]||'Adventurer'
);
