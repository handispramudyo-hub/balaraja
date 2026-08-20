import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import DashboardLayout from '../layouts/DashboardLayout'
import LoginPage from '../pages/auth/LoginPage'
import DashboardPage from '../pages/dashboard/DashboardPage'
import CategoriesPage from '../pages/categories/CategoriesPage'
import SuppliersPage from '../pages/suppliers/SuppliersPage'
import CustomersPage from '../pages/customers/CustomersPage'
import ProductsPage from '../pages/products/ProductsPage'
import PurchasesPage from '../pages/purchases/PurchasesPage'
import CreatePurchase from '../pages/purchases/CreatePurchase'
import SalesPage from '../pages/sales/SalesPage'
import CreateSale from '../pages/sales/CreateSale'
import PaymentsPage from '../pages/payments/PaymentsPage'
import ExpensesPage from '../pages/expenses/ExpensesPage'
import ReceivablesPage from '../pages/receivables/ReceivablesPage'
import ProfitLossPage from '../pages/profitloss/ProfitLossPage'
import StockReport from '../pages/reports/StockReport'
import PurchaseReport from '../pages/reports/PurchaseReport'
import SalesReport from '../pages/reports/SalesReport'
import ReceivableReport from '../pages/reports/ReceivableReport'
import ExpenseReport from '../pages/reports/ExpenseReport'
import ProfitLossReport from '../pages/reports/ProfitLossReport'

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
          <Route path="/penjualan" element={<SalesPage />} />
          <Route path="/penjualan/tambah" element={<CreateSale />} />
          <Route path="/pembayaran" element={<PaymentsPage />} />
          <Route path="/biaya" element={<ExpensesPage />} />
          <Route path="/piutang" element={<ReceivablesPage />} />
          <Route path="/laba-rugi" element={<ProfitLossPage />} />
          <Route path="/laporan/stok" element={<StockReport />} />
          <Route path="/laporan/pembelian" element={<PurchaseReport />} />
          <Route path="/laporan/penjualan" element={<SalesReport />} />
          <Route path="/laporan/piutang" element={<ReceivableReport />} />
          <Route path="/laporan/pengeluaran" element={<ExpenseReport />} />
          <Route path="/laporan/laba-rugi" element={<ProfitLossReport />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
