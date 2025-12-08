import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Users } from 'lucide-react';
import toast from 'react-hot-toast';

const GrandfatherUsersButton: React.FC = () => {
  const { currentUser } = useAuth();
  const [isRunning, setIsRunning] = useState(false);

  const handleGrandfather = async () => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast.error('Admin access required');
      return;
    }

    const confirmed = window.confirm(
      'This will set all existing users without a status to "approved".\n\n' +
      'Are you sure you want to continue?'
    );

    if (!confirmed) return;

    setIsRunning(true);
    try {
      const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');
      const result = await grandfatherUsers({});
      
      const data = result.data as { success: boolean; updatedCount: number; message: string };
      
      if (data.success) {
        toast.success(`✅ Successfully updated ${data.updatedCount} users to approved status!`);
      } else {
        toast.error(data.message || 'Failed to grandfather users');
      }
    } catch (error: any) {
      console.error('Error grandfathering users:', error);
      toast.error(error?.message || 'Failed to grandfather users. Check console for details.');
    } finally {
      setIsRunning(false);
    }
  };

  if (currentUser?.role !== 'admin') {
    return null;
  }

  return (
    <button
      onClick={handleGrandfather}
      disabled={isRunning}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Users className="w-4 h-4" />
      {isRunning ? 'Running...' : 'Grandfather Existing Users'}
    </button>
  );
};

export default GrandfatherUsersButton;

