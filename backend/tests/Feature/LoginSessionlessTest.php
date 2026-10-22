<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Menjamin login token-based tidak bergantung pada session store.
 *
 * Regresi yang diperbaiki: `AuthController::login` memanggil
 * `$request->session()` tanpa syarat. Route `/api/login` memakai
 * `statefulApi()`, yang hanya memasang session store bila request dianggap
 * stateful (header Origin/Referer + SANCTUM_STATEFUL_DOMAINS cocok). Akibatnya
 * login dari klien non-stateful (curl, aplikasi mobile) meledak dengan 500
 * "Session store not set on request" - persis yang muncul di log produksi
 * 2026-10-21 13:17.
 *
 * Migrasi Sanctum tidak dipublikasikan ke `database/migrations`, jadi tabel
 * `personal_access_tokens` perlu dimuat eksplisit di sini.
 */
class LoginSessionlessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('migrate', [
            '--path' => 'vendor/laravel/sanctum/database/migrations',
            '--realpath' => true,
        ]);
    }

    /** @test */
    public function login_tanpa_session_store_tetap_mengembalikan_token()
    {
        $user = User::factory()->create([
            'email' => 'kasir@balaraja.com',
            'password' => Hash::make('rahasia123'),
            'status' => 'active',
        ]);

        // Tanpa header Origin/Referer, request dianggap non-stateful sehingga
        // tidak ada session store - kondisi yang dulu memicu 500.
        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'rahasia123',
        ])
            ->assertOk()
            ->assertJsonStructure(['user', 'token']);
    }

    /** @test */
    public function login_dengan_password_salah_tetap_401_bukan_500()
    {
        $user = User::factory()->create([
            'email' => 'kasir2@balaraja.com',
            'password' => Hash::make('rahasia123'),
            'status' => 'active',
        ]);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'salah',
        ])->assertStatus(401);
    }

    /** @test */
    public function akun_nonaktif_ditolak_403_tanpa_error_session()
    {
        $user = User::factory()->create([
            'email' => 'nonaktif@balaraja.com',
            'password' => Hash::make('rahasia123'),
            'status' => 'inactive',
        ]);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'rahasia123',
        ])->assertStatus(403);
    }
}
