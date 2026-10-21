import { lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import DashboardLayout from '../layouts/DashboardLayout'
import LoginPage from '../pages/auth/LoginPage'

const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage'))
const CategoriesPage = lazy(() => import('../pages/categories/CategoriesPage'))
const SuppliersPage = lazy(() => import('../pages/suppliers/SuppliersPage'))
const CustomersPage = lazy(() => import('../pages/customers/CustomersPage'))
const ProductsPage = lazy(() => import('../pages/products/ProductsPage'))
const PurchasesPage = lazy(() => import('../pages/purchases/PurchasesPage'))
const CreatePurchase = lazy(() => import('../pages/purchases/CreatePurchase'))
const SalesPage = lazy(() => import('../pages/sales/SalesPage'))
const CreateSale = lazy(() => import('../pages/sales/CreateSale'))
const PaymentsPage = lazy(() => import('../pages/payments/PaymentsPage'))
const SupplierPaymentsPage = lazy(() => import('../pages/supplierPayments/SupplierPaymentsPage'))
const InstallmentsPage = lazy(() => import('../pages/installments/InstallmentsPage'))
const ExpensesPage = lazy(() => import('../pages/expenses/ExpensesPage'))
const StockReport = lazy(() => import('../pages/reports/StockReport'))
const PurchaseReport = lazy(() => import('../pages/reports/PurchaseReport'))
const SalesReport = lazy(() => import('../pages/reports/SalesReport'))
const ReceivableReport = lazy(() => import('../pages/reports/ReceivableReport'))
const ExpenseReport = lazy(() => import('../pages/reports/ExpenseReport'))
const ProfitLossReport = lazy(() => import('../pages/reports/ProfitLossReport'))
const ChangePasswordPage = lazy(() => import('../pages/profile/ChangePasswordPage'))

function ProtectedRoute() {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <DashboardLayout />
}

export default function AppRoutes() {
  const token = useAuthStore((s) => s.token)

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/produk" element={<ProductsPage />} />
          <Route path="/kategori" element={<CategoriesPage />} />
          <Route path="/supplier" element={<SuppliersPage />} />
          <Route path="/toko" element={<CustomersPage />} />
          <Route path="/pembelian" element={<PurchasesPage />} />
          <Route path="/pembelian/tambah" element={<CreatePurchase />} />
          <Route path="/pembelian/:id/edit" element={<CreatePurchase />} />
          <Route path="/penjualan" element={<SalesPage />} />
          <Route path="/penjualan/tambah" element={<CreateSale />} />
          <Route path="/penjualan/:id/edit" element={<CreateSale />} />
          <Route path="/pembayaran" element={<PaymentsPage />} />
          <Route path="/pelunasan-utang" element={<SupplierPaymentsPage />} />
    <Route path="/angsuran" element={<InstallmentsPage />} />
          <Route path="/biaya" element={<ExpensesPage />} />
          <Route path="/piutang" element={<ReceivableReport />} />
          <Route path="/laba-rugi" element={<ProfitLossReport />} />
          <Route path="/laporan/stok" element={<StockReport />} />
          <Route path="/laporan/pembelian" element={<PurchaseReport />} />
          <Route path="/laporan/penjualan" element={<SalesReport />} />
          <Route path="/laporan/pengeluaran" element={<ExpenseReport />} />
          <Route path="/laporan/piutang" element={<Navigate to="/piutang" replace />} />
          <Route path="/laporan/laba-rugi" element={<Navigate to="/laba-rugi" replace />} />
          <Route path="/ubah-password" element={<ChangePasswordPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
