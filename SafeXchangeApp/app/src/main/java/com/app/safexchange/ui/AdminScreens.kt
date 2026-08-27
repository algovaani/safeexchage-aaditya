package com.app.safexchange.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.PersonPin
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.app.safexchange.SafeXchangeApp
import com.app.safexchange.BuildConfig
import com.app.safexchange.data.ApiClient
import com.app.safexchange.data.ApiErrorParser
import com.app.safexchange.data.CashInPersonRow
import com.app.safexchange.data.DepositRow
import com.app.safexchange.data.DeviceTokenBody
import com.app.safexchange.data.LoginBody
import com.app.safexchange.data.VerifyBody
import com.app.safexchange.data.VerifyCashInPersonBody
import com.app.safexchange.data.WithdrawalRow
import com.app.safexchange.fcm.AdminFirebaseMessagingService
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private val Accent = Color(0xFFF0B90B)
private val BuyGreen = Color(0xFF0ECB81)
private val SellRed = Color(0xFFF6465D)
private val Panel = Color(0xFF1E2329)
private val Bg = Color(0xFF0B0E11)

class AdminViewModel : ViewModel() {
    private val store = SafeXchangeApp.instance.authStore

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _deposits = MutableStateFlow<List<DepositRow>>(emptyList())
    val deposits: StateFlow<List<DepositRow>> = _deposits.asStateFlow()

    private val _withdrawals = MutableStateFlow<List<WithdrawalRow>>(emptyList())
    val withdrawals: StateFlow<List<WithdrawalRow>> = _withdrawals.asStateFlow()

    private val _cashInPerson = MutableStateFlow<List<CashInPersonRow>>(emptyList())
    val cashInPerson: StateFlow<List<CashInPersonRow>> = _cashInPerson.asStateFlow()

    private val _pendingDeposits = MutableStateFlow(0)
    val pendingDeposits: StateFlow<Int> = _pendingDeposits.asStateFlow()

    private val _pendingWithdrawals = MutableStateFlow(0)
    val pendingWithdrawals: StateFlow<Int> = _pendingWithdrawals.asStateFlow()

    private val _pendingCashInPerson = MutableStateFlow(0)
    val pendingCashInPerson: StateFlow<Int> = _pendingCashInPerson.asStateFlow()

    init {
        viewModelScope.launch {
            store.tokenFlow.collect { _token.value = it }
        }
    }

    fun login(email: String, password: String, onOk: () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val res = ApiClient.api.adminLogin(LoginBody(email.trim(), password))
                if (res.success == false) {
                    _error.value = res.message ?: "Login failed"
                    return@launch
                }
                val token = res.data?.token?.trim().orEmpty()
                if (token.isEmpty()) {
                    _error.value = res.message ?: "Login failed — no token received"
                    return@launch
                }
                store.saveSession(token, email.trim())
                registerFcm()
                onOk()
            } catch (e: Exception) {
                _error.value = ApiErrorParser.message(e)
            } finally {
                _busy.value = false
            }
        }
    }

    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                store.getFcmToken()?.let {
                    ApiClient.api.unregisterDevice(DeviceTokenBody(token = it))
                }
            } catch (_: Exception) {
            }
            store.clear()
            onDone()
        }
    }

    fun registerFcm() {
        viewModelScope.launch {
            try {
                val fcm = FirebaseMessaging.getInstance().token.await()
                android.util.Log.i("AdminFCM", "FCM token length=${fcm.length}")
                store.saveFcmToken(fcm)
                val res = ApiClient.api.registerDevice(
                    DeviceTokenBody(token = fcm, deviceLabel = android.os.Build.MODEL)
                )
                android.util.Log.i("AdminFCM", "Device registered: ${res.message}")
            } catch (e: Exception) {
                android.util.Log.e("AdminFCM", "Push register failed", e)
                _error.value = "Push register: ${e.message}"
            }
        }
    }

    fun refreshCounts() {
        viewModelScope.launch {
            try {
                val s = ApiClient.api.notificationSummary().data
                _pendingDeposits.value = s?.pendingDeposits ?: 0
                _pendingWithdrawals.value = s?.pendingWithdrawals ?: 0
                _pendingCashInPerson.value = s?.pendingCashInPerson ?: 0
            } catch (_: Exception) {
            }
        }
    }

    fun sendTestPush(onDone: (String) -> Unit) {
        viewModelScope.launch {
            try {
                registerFcm()
                kotlinx.coroutines.delay(800)
                val res = ApiClient.api.testPush()
                onDone(res.message ?: "Test push sent")
            } catch (e: Exception) {
                onDone(e.message ?: "Test push failed")
            }
        }
    }

    fun loadDeposits(status: String? = "pending") {
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val res = ApiClient.api.listDeposits(status = status)
                _deposits.value = res.data?.rows ?: emptyList()
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _busy.value = false
            }
        }
    }

    fun loadWithdrawals(status: String? = "pending") {
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val res = ApiClient.api.listWithdrawals(status = status)
                _withdrawals.value = res.data?.rows ?: emptyList()
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _busy.value = false
            }
        }
    }

    fun loadCashInPerson(status: String? = "pending") {
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val res = ApiClient.api.listCashInPerson(status = status)
                _cashInPerson.value = res.data?.rows ?: emptyList()
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _busy.value = false
            }
        }
    }

    fun verifyDeposit(id: String, action: String, note: String = "", onDone: () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            try {
                ApiClient.api.verifyDeposit(id, VerifyBody(action = action, note = note))
                loadDeposits()
                refreshCounts()
                onDone()
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _busy.value = false
            }
        }
    }

    fun verifyWithdrawal(id: String, action: String, note: String = "", onDone: () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            try {
                ApiClient.api.verifyWithdrawal(id, VerifyBody(action = action, note = note))
                loadWithdrawals()
                refreshCounts()
                onDone()
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _busy.value = false
            }
        }
    }

    fun verifyCashInPerson(
        id: String,
        action: String,
        amount: Double? = null,
        note: String = "",
        onDone: () -> Unit,
    ) {
        viewModelScope.launch {
            _busy.value = true
            try {
                ApiClient.api.verifyCashInPerson(
                    id,
                    VerifyCashInPersonBody(action = action, amount = amount, note = note)
                )
                loadCashInPerson()
                refreshCounts()
                onDone()
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _busy.value = false
            }
        }
    }
}

@Composable
fun AdminRoot(startSection: String? = null) {
    val nav = rememberNavController()
    val vm: AdminViewModel = viewModel()
    val token by vm.token.collectAsState()

    LaunchedEffect(token) {
        if (!token.isNullOrBlank()) {
            vm.registerFcm()
            vm.refreshCounts()
            when (startSection) {
                "deposits" -> nav.navigate("deposits") { launchSingleTop = true }
                "withdrawals" -> nav.navigate("withdrawals") { launchSingleTop = true }
                "cashInPerson" -> nav.navigate("cashInPerson") { launchSingleTop = true }
            }
        }
    }

    NavHost(
        navController = nav,
        startDestination = if (token.isNullOrBlank()) "login" else "home"
    ) {
        composable("login") {
            LoginScreen(vm) {
                nav.navigate("home") {
                    popUpTo("login") { inclusive = true }
                }
            }
        }
        composable("home") {
            HomeScreen(vm, nav)
        }
        composable("deposits") {
            DepositListScreen(vm, nav)
        }
        composable("withdrawals") {
            WithdrawListScreen(vm, nav)
        }
        composable("cashInPerson") {
            CashInPersonListScreen(vm, nav)
        }
    }
}

@Composable
fun LoginScreen(vm: AdminViewModel, onLoggedIn: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val busy by vm.busy.collectAsState()
    val error by vm.error.collectAsState()

    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("SafeXchange Admin", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Accent)
            Text("Sign in to review deposits, withdrawals & cash-in-person", color = Color(0xFF848E9C))
            Text(
                "Server: ${BuildConfig.API_BASE_URL.trimEnd('/')}",
                color = Color(0xFF5E6673),
                style = MaterialTheme.typography.bodySmall,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Admin email") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth()
            )
            if (!error.isNullOrBlank()) {
                Text(error!!, color = SellRed)
            }
            Button(
                onClick = { vm.login(email, password, onLoggedIn) },
                enabled = !busy && email.isNotBlank() && password.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.Black)
            ) {
                if (busy) CircularProgressIndicator(modifier = Modifier.size(18.dp))
                else Text("Login")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: AdminViewModel, nav: NavHostController) {
    val dep by vm.pendingDeposits.collectAsState()
    val wd by vm.pendingWithdrawals.collectAsState()
    val cip by vm.pendingCashInPerson.collectAsState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) { vm.refreshCounts() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin Home") },
                actions = {
                    IconButton(onClick = { vm.refreshCounts() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = {
                        vm.logout {
                            scope.launch {
                                nav.navigate("login") {
                                    popUpTo(0) { inclusive = true }
                                }
                            }
                        }
                    }) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Logout")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Panel)
            )
        },
        containerColor = Bg
    ) { pad ->
        Column(
            Modifier
                .padding(pad)
                .padding(16.dp)
                .fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Choose a queue", color = Color(0xFF848E9C))
            HomeCard(
                title = "Deposits",
                subtitle = "$dep pending request(s)",
                icon = Icons.Default.AccountBalanceWallet,
            ) { nav.navigate("deposits") }
            HomeCard(
                title = "Withdrawals",
                subtitle = "$wd pending request(s)",
                icon = Icons.Default.Payments,
            ) { nav.navigate("withdrawals") }
            HomeCard(
                title = "Cash in Person",
                subtitle = "$cip pending request(s)",
                icon = Icons.Default.PersonPin,
            ) { nav.navigate("cashInPerson") }

            var pushMsg by remember { mutableStateOf<String?>(null) }
//            Button(
//                onClick = {
//                    vm.sendTestPush { pushMsg = it }
//                },
//                modifier = Modifier.fillMaxWidth(),
//                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.Black)
//            ) {
//                Text("Send test Firebase notification")
//            }
            if (!pushMsg.isNullOrBlank()) {
                Text(pushMsg!!, color = Color(0xFF848E9C))
            }
        }
    }
}

@Composable
private fun HomeCard(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Panel),
        shape = RoundedCornerShape(14.dp)
    ) {
        Row(
            Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Icon(icon, contentDescription = null, tint = Accent, modifier = Modifier.size(36.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = Color(0xFF848E9C))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DepositListScreen(vm: AdminViewModel, nav: NavHostController) {
    val rows by vm.deposits.collectAsState()
    val busy by vm.busy.collectAsState()
    val error by vm.error.collectAsState()
    val context = LocalContext.current
    var rejectId by remember { mutableStateOf<String?>(null) }
    var remark by remember { mutableStateOf("") }
    var showAll by remember { mutableStateOf(false) }

    LaunchedEffect(showAll) {
        vm.loadDeposits(if (showAll) null else "pending")
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Deposits") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { showAll = !showAll }) {
                        Text(if (showAll) "Pending" else "All")
                    }
                    IconButton(onClick = { vm.loadDeposits(if (showAll) null else "pending") }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Panel)
            )
        },
        containerColor = Bg
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
            when {
                busy && rows.isEmpty() -> CircularProgressIndicator()
                rows.isEmpty() -> Text("No deposits", color = Color(0xFF848E9C))
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(rows, key = { it.rowId() }) { row ->
                        RequestCard(
                            title = row.displayUser(),
                            lines = listOf(
                                "${row.amount ?: 0} ${row.currency ?: "USDT"} · ${row.type ?: ""}",
                                row.usdtAmount?.let { "USDT credit: $it" } ?: "",
                                "Status: ${row.status}",
                                row.network ?: row.chain ?: "",
                                row.createdAt ?: "",
                            ).filter { it.isNotBlank() },
                            status = row.status,
                            onOpenWeb = {
                                val url = AdminFirebaseMessagingService.adminWebUrl("deposits")
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            },
                            onAccept = {
                                vm.verifyDeposit(row.rowId(), "approve") {}
                            },
                            onReject = { rejectId = row.rowId(); remark = "" },
                        )
                    }
                }
            }
            if (!error.isNullOrBlank()) {
                Text(error!!, color = SellRed, modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp))
            }
        }
    }

    if (rejectId != null) {
        RejectDialog(
            remark = remark,
            onRemark = { remark = it },
            onDismiss = { rejectId = null },
            onSubmit = {
                val id = rejectId ?: return@RejectDialog
                if (remark.trim().isEmpty()) return@RejectDialog
                vm.verifyDeposit(id, "reject", remark.trim()) { rejectId = null }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WithdrawListScreen(vm: AdminViewModel, nav: NavHostController) {
    val rows by vm.withdrawals.collectAsState()
    val busy by vm.busy.collectAsState()
    val error by vm.error.collectAsState()
    val context = LocalContext.current
    var rejectId by remember { mutableStateOf<String?>(null) }
    var remark by remember { mutableStateOf("") }
    var showAll by remember { mutableStateOf(false) }

    LaunchedEffect(showAll) {
        vm.loadWithdrawals(if (showAll) null else "pending")
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Withdrawals") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { showAll = !showAll }) {
                        Text(if (showAll) "Pending" else "All")
                    }
                    IconButton(onClick = { vm.loadWithdrawals(if (showAll) null else "pending") }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Panel)
            )
        },
        containerColor = Bg
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
            when {
                busy && rows.isEmpty() -> CircularProgressIndicator()
                rows.isEmpty() -> Text("No withdrawals", color = Color(0xFF848E9C))
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(rows, key = { it.rowId() }) { row ->
                        RequestCard(
                            title = row.displayUser(),
                            lines = listOf(
                                "${row.amount ?: 0} ${row.currency ?: "USDT"} · ${row.type ?: ""}",
                                "Status: ${row.status}",
                                row.walletAddress ?: row.bankName ?: row.network ?: "",
                                row.createdAt ?: "",
                            ).filter { it.isNotBlank() },
                            status = row.status,
                            onOpenWeb = {
                                val url = AdminFirebaseMessagingService.adminWebUrl("withdrawals")
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            },
                            onAccept = {
                                vm.verifyWithdrawal(row.rowId(), "approve") {}
                            },
                            onReject = { rejectId = row.rowId(); remark = "" },
                        )
                    }
                }
            }
            if (!error.isNullOrBlank()) {
                Text(error!!, color = SellRed, modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp))
            }
        }
    }

    if (rejectId != null) {
        RejectDialog(
            remark = remark,
            onRemark = { remark = it },
            onDismiss = { rejectId = null },
            onSubmit = {
                val id = rejectId ?: return@RejectDialog
                if (remark.trim().isEmpty()) return@RejectDialog
                vm.verifyWithdrawal(id, "reject", remark.trim()) { rejectId = null }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CashInPersonListScreen(vm: AdminViewModel, nav: NavHostController) {
    val rows by vm.cashInPerson.collectAsState()
    val busy by vm.busy.collectAsState()
    val error by vm.error.collectAsState()
    val context = LocalContext.current
    var rejectId by remember { mutableStateOf<String?>(null) }
    var approveRow by remember { mutableStateOf<CashInPersonRow?>(null) }
    var remark by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var showAll by remember { mutableStateOf(false) }

    LaunchedEffect(showAll) {
        vm.loadCashInPerson(if (showAll) null else "pending")
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cash in Person") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { showAll = !showAll }) {
                        Text(if (showAll) "Pending" else "All")
                    }
                    IconButton(onClick = { vm.loadCashInPerson(if (showAll) null else "pending") }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Panel)
            )
        },
        containerColor = Bg
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
            when {
                busy && rows.isEmpty() -> CircularProgressIndicator()
                rows.isEmpty() -> Text("No cash-in-person requests", color = Color(0xFF848E9C))
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(rows, key = { it.rowId() }) { row ->
                        val reqType = if (row.type == "withdraw") "withdraw" else "deposit"
                        RequestCard(
                            title = row.displayUser(),
                            lines = listOf(
                                "Type: $reqType",
                                row.requestedAmount?.let { "Requested: $it ${row.currency ?: "USDT"}" } ?: "",
                                row.mobile?.let { "Mobile: $it" } ?: "",
                                row.city?.let { "City: $it" } ?: "",
                                "Status: ${row.status}",
                                row.createdAt ?: "",
                            ).filter { it.isNotBlank() },
                            status = row.status,
                            onOpenWeb = {
                                val url = AdminFirebaseMessagingService.adminWebUrl("cashInPerson")
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            },
                            onAccept = {
                                amount = row.requestedAmount?.toString() ?: ""
                                approveRow = row
                            },
                            onReject = { rejectId = row.rowId(); remark = "" },
                        )
                    }
                }
            }
            if (!error.isNullOrBlank()) {
                Text(error!!, color = SellRed, modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp))
            }
        }
    }

    if (approveRow != null) {
        val row = approveRow!!
        val isWithdraw = row.type == "withdraw"
        ApproveCashInPersonDialog(
            amount = amount,
            onAmount = { amount = it },
            isWithdraw = isWithdraw,
            onDismiss = { approveRow = null },
            onSubmit = {
                val id = row.rowId()
                val parsed = amount.trim().toDoubleOrNull()
                if (parsed == null || parsed <= 0) return@ApproveCashInPersonDialog
                vm.verifyCashInPerson(id, "approve", parsed) { approveRow = null }
            }
        )
    }

    if (rejectId != null) {
        RejectDialog(
            remark = remark,
            onRemark = { remark = it },
            onDismiss = { rejectId = null },
            onSubmit = {
                val id = rejectId ?: return@RejectDialog
                vm.verifyCashInPerson(id, "reject", note = remark.trim()) { rejectId = null }
            },
            optionalRemark = true,
        )
    }
}

@Composable
private fun RequestCard(
    title: String,
    lines: List<String>,
    status: String?,
    onOpenWeb: () -> Unit,
    onAccept: () -> Unit,
    onReject: () -> Unit,
) {
    val pending = status.equals("pending", ignoreCase = true)
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                title,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onOpenWeb)
            )
            lines.forEach { Text(it, color = Color(0xFFB7BDC6), style = MaterialTheme.typography.bodySmall) }
            TextButton(onClick = onOpenWeb) { Text("Open in admin browser") }
            if (pending) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onAccept,
                        colors = ButtonDefaults.buttonColors(containerColor = BuyGreen)
                    ) { Text("Accept") }
                    OutlinedButton(onClick = onReject) { Text("Reject") }
                }
            }
        }
    }
}

@Composable
private fun RejectDialog(
    remark: String,
    onRemark: (String) -> Unit,
    onDismiss: () -> Unit,
    onSubmit: () -> Unit,
    optionalRemark: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Reject request") },
        text = {
            Column {
                Text(if (optionalRemark) "Enter remark for the user (optional)" else "Enter remark for the user")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = remark,
                    onValueChange = onRemark,
                    label = { Text("Remark") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onSubmit,
                enabled = optionalRemark || remark.trim().isNotEmpty(),
                colors = ButtonDefaults.buttonColors(containerColor = SellRed)
            ) { Text("Submit reject") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
private fun ApproveCashInPersonDialog(
    amount: String,
    onAmount: (String) -> Unit,
    isWithdraw: Boolean,
    onDismiss: () -> Unit,
    onSubmit: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isWithdraw) "Approve cash withdraw" else "Approve cash deposit") },
        text = {
            Column {
                Text(
                    if (isWithdraw) {
                        "Enter USDT amount paid out in person."
                    } else {
                        "Enter USDT amount received in person."
                    }
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = amount,
                    onValueChange = onAmount,
                    label = { Text("Amount (USDT)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onSubmit,
                enabled = amount.trim().toDoubleOrNull()?.let { it > 0 } == true,
                colors = ButtonDefaults.buttonColors(containerColor = BuyGreen)
            ) { Text(if (isWithdraw) "Approve & debit" else "Approve & credit") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
