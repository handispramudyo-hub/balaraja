<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        if (!Auth::attempt($credentials)) {
            return response()->json(['message' => 'Email atau kata sandi salah.'], 401);
        }

        $user = Auth::user();

        if ((string) $user->status !== 'active') {
            Auth::logout();

            return response()->json(['message' => 'Akun Anda nonaktif. Hubungi administrator.'], 403);
        }

        // Login ini token-based (Bearer), jadi tidak butuh session. `/api/login`
        // memakai `statefulApi()` yang HANYA memasang session store ketika
        // request dianggap stateful (header Origin/Referer + SANCTUM_STATEFUL_
        // DOMAINS cocok). Memanggil `$request->session()` tanpa syarat membuat
        // login dari klien non-stateful (curl, mobile) meledak dengan 500
        // "Session store not set on request".
        Auth::logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function user(Request $request)
    {
        return response()->json($request->user());
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required',
            'new_password'     => 'required|string|min:8|confirmed',
        ]);

        $user = $request->user();

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json(['message' => 'Kata sandi saat ini salah'], 422);
        }

        if ($request->new_password === $request->current_password) {
            return response()->json(['message' => 'Kata sandi baru tidak boleh sama dengan kata sandi saat ini'], 422);
        }

        $user->password = Hash::make($request->new_password);
        $user->save();

        $user->tokens()
            ->where('id', '!=', $request->user()->currentAccessToken()->id)
            ->delete();

        return response()->json(['message' => 'Kata sandi berhasil diubah, perangkat lain telah keluar']);
    }
}
