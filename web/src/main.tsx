import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import { ProductList } from './pages/ProductList';
import { ProductDetail } from './pages/ProductDetail';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <Link to="/" className="text-lg font-semibold">Seguidor de precios</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<ProductList />} />
          <Route path="/products/:id" element={<ProductDetail />} />
        </Routes>
      </main>
    </BrowserRouter>
  </StrictMode>,
);
