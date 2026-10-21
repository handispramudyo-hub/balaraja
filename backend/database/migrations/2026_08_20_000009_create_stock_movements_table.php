<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained();
            // Daftar final sudah termasuk seluruh tipe pembatalan. Nilai ini
            // di-narrow lalu di-luaskan lagi oleh migration 09-24/09-25/09-26,
            // jadi instalasi baru langsung benar tanpa depending pada urutan.
            $table->enum('type', ['purchase', 'sale', 'adjustment', 'purchase_reverse', 'sale_reverse', 'adjustment_reverse']);
            $table->integer('quantity');
            $table->integer('stock_before');
            $table->integer('stock_after');
            $table->string('reference_type')->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->text('note')->nullable();
            $table->date('date');
            $table->foreignId('user_id')->constrained();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
