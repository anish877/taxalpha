import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';
import { BrokerageAlternativeInvestmentOrderDisclosureStep1Page } from './pages/BrokerageAlternativeInvestmentOrderDisclosureStep1Page';
import { BrokerageAlternativeInvestmentOrderDisclosureStep2Page } from './pages/BrokerageAlternativeInvestmentOrderDisclosureStep2Page';
import { BrokerageAlternativeInvestmentOrderDisclosureStep3Page } from './pages/BrokerageAlternativeInvestmentOrderDisclosureStep3Page';
import { BrokerageAccreditedInvestorVerificationStep1Page } from './pages/BrokerageAccreditedInvestorVerificationStep1Page';
import { BrokerageAccreditedInvestorVerificationStep2Page } from './pages/BrokerageAccreditedInvestorVerificationStep2Page';
import { ClientFormReviewPage } from './pages/ClientFormReviewPage';
import { ClientFormsWorkspacePage } from './pages/ClientFormsWorkspacePage';
import { DashboardPage } from './pages/DashboardPage';
import { InvestorProfileStep1Page } from './pages/InvestorProfileStep1Page';
import { InvestorProfileStep2Page } from './pages/InvestorProfileStep2Page';
import { InvestorProfileStep3Page } from './pages/InvestorProfileStep3Page';
import { InvestorProfileStep4Page } from './pages/InvestorProfileStep4Page';
import { InvestorProfileStep5Page } from './pages/InvestorProfileStep5Page';
import { InvestorProfileStep6Page } from './pages/InvestorProfileStep6Page';
import { InvestorProfileStep7Page } from './pages/InvestorProfileStep7Page';
import { LandingPage } from './pages/LandingPage';
import { StatementOfFinancialConditionStep1Page } from './pages/StatementOfFinancialConditionStep1Page';
import { StatementOfFinancialConditionStep2Page } from './pages/StatementOfFinancialConditionStep2Page';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<LandingPage />} path="/" />
        <Route
          element={
            <PublicOnlyRoute>
              <SignInPage />
            </PublicOnlyRoute>
          }
          path="/signin"
        />
        <Route
          element={
            <PublicOnlyRoute>
              <SignUpPage />
            </PublicOnlyRoute>
          }
          path="/signup"
        />
        <Route
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
          path="/dashboard"
        />
        <Route
          element={
            <ProtectedRoute>
              <ClientFormsWorkspacePage />
            </ProtectedRoute>
          }
          path="/clients/:clientId/forms"
        />
        <Route
          element={
            <ProtectedRoute>
              <ClientFormReviewPage />
            </ProtectedRoute>
          }
          path="/clients/:clientId/forms/:formCode/:mode/step/:stepNumber"
        />
        <Route
          element={
            <ProtectedRoute>
              <InvestorProfileStep1Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/investor-profile/step-1"
        />
        <Route
          element={
            <ProtectedRoute>
              <InvestorProfileStep2Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/investor-profile/step-2"
        />
        <Route
          element={
            <ProtectedRoute>
              <InvestorProfileStep3Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/investor-profile/step-3"
        />
        <Route
          element={
            <ProtectedRoute>
              <InvestorProfileStep4Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/investor-profile/step-4"
        />
        <Route
          element={
            <ProtectedRoute>
              <InvestorProfileStep5Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/investor-profile/step-5"
        />
        <Route
          element={
            <ProtectedRoute>
              <InvestorProfileStep6Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/investor-profile/step-6"
        />
        <Route
          element={
            <ProtectedRoute>
              <InvestorProfileStep7Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/investor-profile/step-7"
        />
        <Route
          element={
            <ProtectedRoute>
              <StatementOfFinancialConditionStep1Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/statement-of-financial-condition/step-1"
        />
        <Route
          element={
            <ProtectedRoute>
              <StatementOfFinancialConditionStep2Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/statement-of-financial-condition/step-2"
        />
        <Route
          element={
            <ProtectedRoute>
              <BrokerageAlternativeInvestmentOrderDisclosureStep1Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/brokerage-alternative-investment-order-disclosure/step-1"
        />
        <Route
          element={
            <ProtectedRoute>
              <BrokerageAlternativeInvestmentOrderDisclosureStep2Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/brokerage-alternative-investment-order-disclosure/step-2"
        />
        <Route
          element={
            <ProtectedRoute>
              <BrokerageAlternativeInvestmentOrderDisclosureStep3Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/brokerage-alternative-investment-order-disclosure/step-3"
        />
        <Route
          element={
            <ProtectedRoute>
              <BrokerageAccreditedInvestorVerificationStep1Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/brokerage-accredited-investor-verification/step-1"
        />
        <Route
          element={
            <ProtectedRoute>
              <BrokerageAccreditedInvestorVerificationStep2Page />
            </ProtectedRoute>
          }
          path="/clients/:clientId/brokerage-accredited-investor-verification/step-2"
        />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </BrowserRouter>
  );
}
