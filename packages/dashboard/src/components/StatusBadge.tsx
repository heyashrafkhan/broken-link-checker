import React from 'react';
import { getStatusBg, getErrorTypeBadgeColor } from '../utils/format';
import { AlertCircle, CheckCircle2, AlertTriangle, ShieldAlert, WifiOff, Clock } from 'lucide-react';

interface StatusBadgeProps {
  statusCode: number | null;
  errorType?: string | null;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ statusCode, errorType }) => {
  if (statusCode !== null && statusCode > 0) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${getStatusBg(
          statusCode,
        )}`}
      >
        {statusCode}
      </span>
    );
  }

  // Error type badge when no HTTP status was received
  const getIcon = () => {
    switch (errorType) {
      case 'timeout':
        return <Clock className="w-3 h-3 mr-1" />;
      case 'dns':
      case 'dns-error':
        return <WifiOff className="w-3 h-3 mr-1" />;
      case 'ssl':
      case 'ssl-error':
        return <ShieldAlert className="w-3 h-3 mr-1" />;
      case 'redirect-loop':
      case 'too-many-redirects':
        return <AlertTriangle className="w-3 h-3 mr-1" />;
      default:
        return <AlertCircle className="w-3 h-3 mr-1" />;
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${getErrorTypeBadgeColor(
        errorType ?? null,
      )}`}
    >
      {getIcon()}
      {errorType || 'Failed'}
    </span>
  );
};
