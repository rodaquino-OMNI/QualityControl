import React, { useState } from 'react';
import { useEnableMFAMutation, useDisableMFAMutation } from '../../services/authService';
import { useAppSelector } from '../../store/hooks';
import { Shield, Smartphone, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import QRCode from 'qrcode';

export const MFASettings: React.FC = () => {
  const user = useAppSelector((state) => state.auth.user);
  const [enableMFA, { isLoading: isEnabling }] = useEnableMFAMutation();
  const [disableMFA, { isLoading: isDisabling }] = useDisableMFAMutation();

  const [showEnableModal, setShowEnableModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [mfaData, setMfaData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [error, setError] = useState('');

  const handleEnableMFA = async () => {
    try {
      const result = await enableMFA().unwrap();
      setMfaData(result);
      
      // Generate QR code data URL
      const dataUrl = await QRCode.toDataURL(result.qrCode);
      setQrCodeDataUrl(dataUrl);
      
      setShowEnableModal(true);
      setError('');
    } catch (err: any) {
      setError(err.data?.message || 'Failed to enable MFA');
    }
  };

  const handleDisableMFA = async () => {
    if (verificationCode.length !== 6) return;

    try {
      await disableMFA({ token: verificationCode }).unwrap();
      setShowDisableModal(false);
      setVerificationCode('');
      setError('');
    } catch (err: any) {
      setError(err.data?.message || 'Failed to disable MFA');
    }
  };

  const closeEnableModal = () => {
    setShowEnableModal(false);
    setMfaData(null);
    setQrCodeDataUrl('');
    setError('');
  };

  const closeDisableModal = () => {
    setShowDisableModal(false);
    setVerificationCode('');
    setError('');
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Shield className="h-6 w-6 text-indigo-600 dark:text-indigo-400 mr-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Two-Factor Authentication
          </h3>
        </div>
        {user?.mfaEnabled ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            Enabled
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
            Disabled
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Add an extra layer of security to your account by enabling two-factor authentication.
        You'll need to enter a code from your authenticator app when signing in.
      </p>

      {user?.mfaEnabled ? (
        <button
          onClick={() => setShowDisableModal(true)}
          className="inline-flex items-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:bg-gray-700 dark:text-red-400 dark:border-red-600 dark:hover:bg-gray-600"
        >
          Disable 2FA
        </button>
      ) : (
        <button
          onClick={handleEnableMFA}
          disabled={isEnabling}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isEnabling ? (
            <>
              <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
              Setting up...
            </>
          ) : (
            <>
              <Smartphone className="-ml-1 mr-2 h-4 w-4" />
              Enable 2FA
            </>
          )}
        </button>
      )}

      {/* Enable MFA Modal */}
      {showEnableModal && mfaData && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Set Up Two-Factor Authentication
              </h3>
              <button
                onClick={closeEnableModal}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  1. Install an authenticator app on your phone (Google Authenticator, Authy, etc.)
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  2. Scan this QR code with your authenticator app:
                </p>
              </div>

              {qrCodeDataUrl && (
                <div className="flex justify-center p-4 bg-white rounded border border-gray-200">
                  <img src={qrCodeDataUrl} alt="MFA QR Code" className="w-48 h-48" />
                </div>
              )}

              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Or enter this code manually:
                </p>
                <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded font-mono text-sm break-all">
                  {mfaData.secret}
                </div>
              </div>

              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      Save this secret code in a safe place. You'll need it to recover access if you lose your device.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={closeEnableModal}
                className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                I've saved the code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable MFA Modal */}
      {showDisableModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Disable Two-Factor Authentication
              </h3>
              <button
                onClick={closeDisableModal}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter your current authentication code to disable two-factor authentication:
            </p>

            <div className="mb-4">
              <label htmlFor="verification-code" className="sr-only">
                Verification Code
              </label>
              <input
                id="verification-code"
                type="text"
                pattern="[0-9]{6}"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                placeholder="000000"
              />
            </div>

            {error && (
              <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/20 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={closeDisableModal}
                className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                onClick={handleDisableMFA}
                disabled={isDisabling || verificationCode.length !== 6}
                className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDisabling ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Disabling...
                  </>
                ) : (
                  'Disable 2FA'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};