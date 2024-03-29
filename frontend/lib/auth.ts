'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/jwt';
import { z } from 'zod';
import { SignInSchema } from '@/types/schemes';
import type { TSession } from '@/types/types';
import type { NextRequest } from 'next/server';

function parseUser(user: z.output<typeof SignInSchema>) {
  return {
    domain: user?.domain || '',
    type: user?.type || '',
    idntSwd: user?.idntSwd || '',
    login_ewus: user?.login_ewus || '',
    password_ewus: user?.password_ewus || '',
  };
}

async function authenticate(user: z.output<typeof SignInSchema>) {
  const parsedUser = parseUser(user);

  try {
    const response = await fetch(
      `${process.env.SERVER_BASE_URL}/login/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        },
        body: JSON.stringify(parsedUser),
      }
    );

    if (response.ok) {
      console.log('Promise resolved and HTTP request status is successful');

      return await response.json();
    } else {
      switch (response.status) {
        case 400:
          throw new Error('404. Not found');

        case 500:
          throw new Error('500. internal server error');

        default:
          throw new Error(`${response.status}`);
      }
    }
  } catch (error) {
    console.log('Fetch', error);
  }
}

export async function signIn(formData: z.output<typeof SignInSchema>) {
  const parsedFormData = SignInSchema.safeParse(formData);

  if (!parsedFormData.success) {
    return {
      message: 'Nieprawidłowe dane logowania.',
    };
  }

  const responseData = await authenticate(formData);

  if (responseData?.session_id && responseData?.token_id) {
    const userSessionEwus = {
      login_ewus: formData.login_ewus,
      session_id: responseData.session_id,
      token_id: responseData.token_id,
    };

    const expires = new Date(Date.now() + 10 * 60 * 1000);
    const session = await encrypt({ userSessionEwus, expires });

    cookies().set('session', session, { expires, httpOnly: true });

    redirect('/');
  } else {
    return (
      {
        message: 'Nieudana próba zalogowania użytkownika.'
      }
    );
  }
}

export async function signOut() {
  cookies().set('session', '', { expires: new Date(0) });

  redirect('/login');
}

export async function getSession(): Promise<TSession | null> {
  const session = cookies().get('session')?.value;

  if (!session) return null;

  return await decrypt(session);
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get('session')?.value;

  if (!session) return;

  const parsed = await decrypt(session);
  parsed.expires = new Date(Date.now() + 10 * 60 * 1000);

  const response = NextResponse.next();
  response.cookies.set({
    name: 'session',
    value: await encrypt(parsed),
    httpOnly: true,
    expires: parsed.expires,
  });

  return response;
}
