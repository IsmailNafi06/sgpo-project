$edges = Get-Content 'backend/src/main/resources/data/edges.json' -Raw | ConvertFrom-Json
$nodes = Get-Content 'backend/src/main/resources/data/nodes_all.json' -Raw | ConvertFrom-Json

# IDs des 6 FILIEREs BTS Comptabilite et Gestion
$btsIds = @(
    'e1fb9eb0-11a8-48a8-8db4-798c189438a5',
    '3acb75a6-1d8c-afe0-b5b2-dc4352953f75',
    'a7262d17-31c2-2d1c-a817-ee6a86732f87',
    '36ae1d1b-c540-9492-4bca-1792d79892b2',
    'c85aae2f-53b1-0dbc-b5fe-727a50dd7488',
    '2874a6a7-eba0-1794-dc33-63b73e35011e'
)

Write-Host "=== ARETES RELIEES AUX 6 FILIEREs BTS Comptabilite ==="
foreach ($id in $btsIds) {
    $fil = $nodes | Where-Object { $_.id -eq $id }
    $incoming = $edges | Where-Object { $_.target_id -eq $id }
    $outgoing = $edges | Where-Object { $_.source_id -eq $id }
    Write-Host ""
    Write-Host "--- $($fil.nom_fr) ($id) ---"
    Write-Host "  Aretes entrantes ($($incoming.Count)):"
    foreach ($e in $incoming) {
        $src = $nodes | Where-Object { $_.id -eq $e.source_id }
        Write-Host "    [$($e.type_lien)] $($src.type) '$($src.nom_fr)' ($($e.source_id))"
    }
    Write-Host "  Aretes sortantes ($($outgoing.Count)):"
    foreach ($e in $outgoing) {
        $tgt = $nodes | Where-Object { $_.id -eq $e.target_id }
        Write-Host "    [$($e.type_lien)] $($tgt.type) '$($tgt.nom_fr)' ($($e.target_id))"
    }
}

Write-Host ""
Write-Host "=== ETABS CENTRE BTS dans nodes ==="
$etabBts = $nodes | Where-Object { $_.type -eq 'ETABLISSEMENT' -and ($_.nom_fr -like '*Centre BTS*' -or $_.nom_fr -like '*ENSET*Mohammedia*' -or $_.nom_fr -like '*OFPPT*') }
foreach ($e in $etabBts) {
    Write-Host "  ID=$($e.id) nom='$($e.nom_fr)' ville=$($e.ville)"
}
