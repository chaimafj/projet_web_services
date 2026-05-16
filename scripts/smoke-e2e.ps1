$ErrorActionPreference = "Stop"

$graphqlUrl = "http://localhost:4000/graphql"
$healthUrls = @(
  "http://localhost:4000/health",
  "http://localhost:4001/health",
  "http://localhost:4002/health",
  "http://localhost:4003/health",
  "http://localhost:4004/health",
  "http://localhost:4005/health"
)

function Invoke-GraphQL {
  param(
    [string]$Query,
    [hashtable]$Variables,
    [string]$Token
  )

  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $body = @{ query = $Query; variables = $Variables } | ConvertTo-Json -Depth 10
  $response = Invoke-RestMethod -Uri $graphqlUrl -Method Post -Headers $headers -Body $body

  if ($response.errors) {
    $message = ($response.errors | ConvertTo-Json -Depth 10)
    throw "GraphQL errors: $message"
  }

  return $response.data
}

Write-Host "[1/6] Verification des services..."
foreach ($url in $healthUrls) {
  try {
    $null = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 3
  }
  catch {
    throw "Service indisponible: $url"
  }
}

$unique = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "e2e.$unique@city.com"
$password = "admin123"
$plate = "E2E$unique"

Write-Host "[2/6] Register..."
$registerQuery = @'
mutation($email: String!, $password: String!, $role: String) {
  register(email: $email, password: $password, role: $role) {
    id
    email
    role
  }
}
'@
$registerData = Invoke-GraphQL -Query $registerQuery -Variables @{ email = $email; password = $password; role = "ADMIN" }
if (-not $registerData.register.id) {
  throw "Register a echoue"
}

Write-Host "[3/6] Login..."
$loginQuery = @'
mutation($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    token
    role
  }
}
'@
$loginData = Invoke-GraphQL -Query $loginQuery -Variables @{ email = $email; password = $password }
$token = $loginData.login.token
if (-not $token) {
  throw "Login a echoue"
}

Write-Host "[4/6] AddVehicle..."
$addVehicleQuery = @'
mutation($plateNumber: String!, $brand: String!, $model: String!) {
  addVehicle(plateNumber: $plateNumber, brand: $brand, model: $model) {
    id
    plateNumber
    brand
    model
  }
}
'@
$vehicleData = Invoke-GraphQL -Query $addVehicleQuery -Variables @{ plateNumber = $plate; brand = "Toyota"; model = "Corolla" } -Token $token
$vehicleId = $vehicleData.addVehicle.id
if (-not $vehicleId) {
  throw "Creation vehicule a echoue"
}

Write-Host "[5/6] Query Vehicles..."
$queryVehicles = @'
query {
  vehicles {
    id
    plateNumber
  }
}
'@
$listData = Invoke-GraphQL -Query $queryVehicles -Variables @{} -Token $token
$created = $listData.vehicles | Where-Object { $_.plateNumber -eq $plate } | Select-Object -First 1
if (-not $created) {
  throw "Vehicule cree introuvable dans la liste"
}

Write-Host "[6/6] OK"
Write-Host "E2E reussi"
Write-Host "email=$email"
Write-Host "vehicleId=$vehicleId"
