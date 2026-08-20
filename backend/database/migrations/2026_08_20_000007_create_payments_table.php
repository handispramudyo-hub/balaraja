<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_number')->unique();
            $table->date('date');
            $table->foreignId('customer_id')->constrained();
            $table->foreignId('sale_id')->constrained();
            $table->decimal('amount', 15, 2);
            $table->enum('method', ['cash', 'transfer', 'other'])->default('cash');
            $table->text('note')->nullable();
            $table->foreignId('user_id')->constrained();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
