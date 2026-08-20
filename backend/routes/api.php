<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ReportController;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/dashboard', [DashboardController::class, 'index']);

    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('suppliers', SupplierController::class);
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('products', ProductController::class);

    Route::apiResource('purchases', PurchaseController::class)->only(['index', 'store', 'show']);
    Route::apiResource('sales', SaleController::class)->only(['index', 'store', 'show']);

    Route::apiResource('payments', PaymentController::class)->only(['index', 'store']);
    Route::apiResource('expenses', ExpenseController::class);

    Route::prefix('reports')->group(function () {
        Route::get('/stock', [ReportController::class, 'stock']);
        Route::get('/purchases', [ReportController::class, 'purchases']);
        Route::get('/sales', [ReportController::class, 'sales']);
        Route::get('/receivables', [ReportController::class, 'receivables']);
        Route::get('/expenses', [ReportController::class, 'expenses']);
        Route::get('/profit-loss', [ReportController::class, 'profitLoss']);
    });
});
