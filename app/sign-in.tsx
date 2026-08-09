import { Redirect } from 'expo-router';

// /sign-in is a convention-based URL that external links and bookmarks tend
// to use. The real screen lives at /auth/login — bounce there.
export default function SignInRedirect() {
  return <Redirect href="/auth/login" />;
}
