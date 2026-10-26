<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_units', function (Blueprint $table) {
            $table->decimal('buy_price', 15, 2)->nullable()->after('factor');
            $table->decimal('sell_price', 15, 2)->nullable()->after('buy_price');
        });
    }

    public function down(): void
    {
        Schema::table('product_units', function (Blueprint $table) {
            $table->dropColumn(['buy_price', 'sell_price']);
        });
    }
};
