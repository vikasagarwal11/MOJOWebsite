import { collection, getFirestore, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';

interface PaymentTransaction {
    id: string;
    transactionId: string;
    eventId: string;
    eventTitle?: string;
    amount: number;
    currency: string;
    paymentMethod: 'stripe' | 'zelle';
    status: 'pending' | 'completed' | 'failed';
    isGuestPayment: boolean;
    guestContactInfo?: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
    };
    createdAt: Timestamp;
    completedAt?: Timestamp;
    verifiedBy?: string;
    adminNotes?: string;
    stripePaymentIntentId?: string;
    invoiceId?: string;
    invoiceNumber?: string;
}

type StatusFilter = 'all' | 'pending' | 'completed' | 'failed';
type MethodFilter = 'all' | 'stripe' | 'zelle';

export const AdminPaymentMonitor: React.FC = () => {
    const db = getFirestore();
    const functions = getFunctions();

    const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
    const [filteredTransactions, setFilteredTransactions] = useState<PaymentTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedTransaction, setSelectedTransaction] = useState<PaymentTransaction | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [adminNotes, setAdminNotes] = useState('');

    // Real-time listener for transactions
    useEffect(() => {
        const q = query(
            collection(db, 'payment_transactions'),
            where('isGuestPayment', '==', true),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const txns: PaymentTransaction[] = [];
                snapshot.forEach((doc) => {
                    txns.push({ id: doc.id, ...doc.data() } as PaymentTransaction);
                });
                setTransactions(txns);
                setIsLoading(false);
            },
            (err) => {
                console.error('Error fetching transactions:', err);
                setError('Failed to load transactions');
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db]);

    // Apply filters
    useEffect(() => {
        let filtered = [...transactions];

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(txn => txn.status === statusFilter);
        }

        // Method filter
        if (methodFilter !== 'all') {
            filtered = filtered.filter(txn => txn.paymentMethod === methodFilter);
        }

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(txn => {
                const name = `${txn.guestContactInfo?.firstName} ${txn.guestContactInfo?.lastName}`.toLowerCase();
                const email = txn.guestContactInfo?.email?.toLowerCase() || '';
                const transactionId = txn.transactionId.toLowerCase();
                const invoiceNumber = txn.invoiceNumber?.toLowerCase() || '';

                return name.includes(query) ||
                    email.includes(query) ||
                    transactionId.includes(query) ||
                    invoiceNumber.includes(query);
            });
        }

        setFilteredTransactions(filtered);
    }, [transactions, statusFilter, methodFilter, searchQuery]);

    const handleMarkComplete = async (transaction: PaymentTransaction) => {
        if (!transaction.id) return;

        setIsVerifying(true);
        setError(null);

        try {
            const markComplete = httpsCallable<
                { transactionId: string; adminNotes?: string },
                { success: boolean; invoiceNumber: string }
            >(functions, 'markZellePaymentComplete');

            const result = await markComplete({
                transactionId: transaction.id,
                adminNotes: adminNotes.trim() || undefined
            });

            if (result.data.success) {
                setSelectedTransaction(null);
                setAdminNotes('');
                // Transaction will update via real-time listener
            }
        } catch (err: any) {
            console.error('Error marking payment complete:', err);
            setError(err.message || 'Failed to mark payment as complete');
        } finally {
            setIsVerifying(false);
        }
    };

    const formatAmount = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase()
        }).format(amount / 100);
    };

    const formatDate = (timestamp: Timestamp) => {
        return timestamp.toDate().toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'completed': return 'status-badge status-completed';
            case 'pending': return 'status-badge status-pending';
            case 'failed': return 'status-badge status-failed';
            default: return 'status-badge';
        }
    };

    if (isLoading) {
        return (
            <div className="admin-payment-monitor loading">
                <div className="spinner" />
                <p>Loading transactions...</p>
            </div>
        );
    }

    return (
        <div className="admin-payment-monitor">
            <div className="monitor-header">
                <h1>Guest Payment Monitor</h1>
                <div className="stats">
                    <div className="stat-card">
                        <span className="stat-label">Total</span>
                        <span className="stat-value">{transactions.length}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Pending</span>
                        <span className="stat-value pending">
                            {transactions.filter(t => t.status === 'pending').length}
                        </span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Completed</span>
                        <span className="stat-value completed">
                            {transactions.filter(t => t.status === 'completed').length}
                        </span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="error-message" role="alert">
                    {error}
                </div>
            )}

            <div className="filters">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search by name, email, transaction ID, or invoice..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="filter-group">
                    <label>Status:</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                        className="filter-select"
                    >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Method:</label>
                    <select
                        value={methodFilter}
                        onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
                        className="filter-select"
                    >
                        <option value="all">All</option>
                        <option value="stripe">Stripe</option>
                        <option value="zelle">Zelle</option>
                    </select>
                </div>
            </div>

            <div className="transactions-table">
                {filteredTransactions.length === 0 ? (
                    <div className="no-transactions">
                        <p>No transactions found</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Customer</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Event</th>
                                <th>Amount</th>
                                <th>Method</th>
                                <th>Status</th>
                                <th>Invoice</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTransactions.map((txn) => (
                                <tr key={txn.id}>
                                    <td>{formatDate(txn.createdAt)}</td>
                                    <td>
                                        {txn.guestContactInfo?.firstName} {txn.guestContactInfo?.lastName}
                                    </td>
                                    <td>{txn.guestContactInfo?.email}</td>
                                    <td>{txn.guestContactInfo?.phone}</td>
                                    <td>{txn.eventTitle || txn.eventId}</td>
                                    <td className="amount">{formatAmount(txn.amount, txn.currency)}</td>
                                    <td>
                                        <span className={`method-badge method-${txn.paymentMethod}`}>
                                            {txn.paymentMethod.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={getStatusBadgeClass(txn.status)}>
                                            {txn.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>{txn.invoiceNumber || '-'}</td>
                                    <td>
                                        {txn.status === 'pending' && txn.paymentMethod === 'zelle' && (
                                            <button
                                                onClick={() => setSelectedTransaction(txn)}
                                                className="action-button verify-button"
                                            >
                                                Mark Complete
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setSelectedTransaction(txn)}
                                            className="action-button view-button"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Transaction Detail Modal */}
            {selectedTransaction && (
                <div className="modal-overlay" onClick={() => setSelectedTransaction(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Transaction Details</h2>
                            <button
                                onClick={() => setSelectedTransaction(null)}
                                className="close-button"
                            >
                                ×
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="detail-section">
                                <h3>Customer Information</h3>
                                <div className="detail-row">
                                    <span className="label">Name:</span>
                                    <span className="value">
                                        {selectedTransaction.guestContactInfo?.firstName}{' '}
                                        {selectedTransaction.guestContactInfo?.lastName}
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Email:</span>
                                    <span className="value">{selectedTransaction.guestContactInfo?.email}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Phone:</span>
                                    <span className="value">{selectedTransaction.guestContactInfo?.phone}</span>
                                </div>
                            </div>

                            <div className="detail-section">
                                <h3>Payment Information</h3>
                                <div className="detail-row">
                                    <span className="label">Transaction ID:</span>
                                    <span className="value">{selectedTransaction.transactionId}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Amount:</span>
                                    <span className="value">
                                        {formatAmount(selectedTransaction.amount, selectedTransaction.currency)}
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Method:</span>
                                    <span className="value">{selectedTransaction.paymentMethod.toUpperCase()}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Status:</span>
                                    <span className={getStatusBadgeClass(selectedTransaction.status)}>
                                        {selectedTransaction.status.toUpperCase()}
                                    </span>
                                </div>
                                {selectedTransaction.invoiceNumber && (
                                    <div className="detail-row">
                                        <span className="label">Invoice:</span>
                                        <span className="value">{selectedTransaction.invoiceNumber}</span>
                                    </div>
                                )}
                            </div>

                            <div className="detail-section">
                                <h3>Event Information</h3>
                                <div className="detail-row">
                                    <span className="label">Event:</span>
                                    <span className="value">{selectedTransaction.eventTitle || selectedTransaction.eventId}</span>
                                </div>
                            </div>

                            <div className="detail-section">
                                <h3>Timestamps</h3>
                                <div className="detail-row">
                                    <span className="label">Created:</span>
                                    <span className="value">{formatDate(selectedTransaction.createdAt)}</span>
                                </div>
                                {selectedTransaction.completedAt && (
                                    <div className="detail-row">
                                        <span className="label">Completed:</span>
                                        <span className="value">{formatDate(selectedTransaction.completedAt)}</span>
                                    </div>
                                )}
                            </div>

                            {selectedTransaction.status === 'pending' && selectedTransaction.paymentMethod === 'zelle' && (
                                <div className="verification-section">
                                    <h3>Verify Payment</h3>
                                    <p>Confirm that you have received the Zelle payment before marking as complete.</p>

                                    <div className="form-group">
                                        <label htmlFor="adminNotes">Admin Notes (Optional):</label>
                                        <textarea
                                            id="adminNotes"
                                            value={adminNotes}
                                            onChange={(e) => setAdminNotes(e.target.value)}
                                            placeholder="Add any notes about this payment verification..."
                                            rows={3}
                                            className="admin-notes-input"
                                        />
                                    </div>

                                    <button
                                        onClick={() => handleMarkComplete(selectedTransaction)}
                                        disabled={isVerifying}
                                        className="verify-complete-button"
                                    >
                                        {isVerifying ? 'Processing...' : 'Mark as Complete & Send Confirmation'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
