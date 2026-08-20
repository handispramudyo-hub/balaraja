<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::create([
            'name' => 'Admin',
            'email' => 'admin@balaraja.com',
            'password' => Hash::make('password'),
            'status' => 'active',
        ]);

        $categories = [
            'Air Mineral', 'Teh', 'Soda', 'Susu', 'Jus',
            'Minuman Energi', 'Kopi', 'Sirup', 'Minuman Ringan',
        ];

        foreach ($categories as $category) {
            Category::create(['name' => $category]);
        }
    }
}
