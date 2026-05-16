$ports = @(4000, 4001, 4002, 4003, 4004, 4005)

foreach ($port in $ports) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listeners) {
    Write-Host "Port ${port}: aucun process"
    continue
  }

  $processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $processIds) {
    try {
      $proc = Get-Process -Id $procId -ErrorAction Stop
      Stop-Process -Id $procId -Force
      Write-Host "Port ${port}: arrete PID=$procId ($($proc.ProcessName))"
    }
    catch {
      Write-Host "Port ${port}: impossible d'arreter PID=$procId"
    }
  }
}
