$edges = Get-Content 'backend/src/main/resources/data/edges.json' -Raw | ConvertFrom-Json
$nodes = Get-Content 'backend/src/main/resources/data/nodes_all.json' -Raw | ConvertFrom-Json

$centreIds = @(
    '0a79b0ee-5e30-c97d-7192-a3a8f2adfbf4',  # Centre BTS Casablanca
    'd889f6ab-8fde-495b-b999-339f5f48588b',  # Centre BTS Fes
    '4b352195-5094-1939-908f-faf6617e850c',  # Centre BTS Marrakech
    'c61807c9-d9da-9e53-2577-0925b4a15387',  # Centre BTS Rabat
    'c52a9206-ae0b-f646-0e08-6e689b27d214'   # ENSET Mohammedia
)

Write-Host "=== ACCESSIBILITE DES ETABs CENTRE BTS ==="
foreach ($id in $centreIds) {
    $etab = $nodes | Where-Object { $_.id -eq $id }
    $incoming = $edges | Where-Object { $_.target_id -eq $id }
    Write-Host ""
    Write-Host "ETAB: $($etab.nom_fr) ($id)"
    Write-Host "  Aretes entrantes ($($incoming.Count)):"
    foreach ($e in $incoming) {
        $src = $nodes | Where-Object { $_.id -eq $e.source_id }
        Write-Host "    [$($e.type_lien)] $($src.type) '$($src.nom_fr)'"
    }
}

# BAC nodes qui envoient vers les 4 BAC specifiques
Write-Host ""
Write-Host "=== BAC NODES associes a BTS (depuis aretes des city-specific) ==="
$bacIds = @(
    'a49dcee7-b579-5edd-8d43-bfc398f690c7',  # BAC_SGC
    'f10fa042-2c1a-5775-8ba9-f0641edd5da9',  # BAC_ECO
    'e3f0ebb3-c0c7-5a17-bc84-2de9736e2a85',  # BAC_SM
    '84a28554-5207-5ee6-a33f-340e0b111cfd'   # BAC_SE
)
foreach ($id in $bacIds) {
    $bac = $nodes | Where-Object { $_.id -eq $id }
    Write-Host "  BAC: '$($bac.nom_fr)' code=$($bac.code)"
}

# Verifier si aretes BAC -> generique existent deja
Write-Host ""
Write-Host "=== ARETES BAC -> FILIERE GENERIQUE BTS (e1fb9eb0) ==="
$genId = 'e1fb9eb0-11a8-48a8-8db4-798c189438a5'
$existing = $edges | Where-Object { $_.target_id -eq $genId }
Write-Host "  Aretes entrantes sur la FILIERE generique: $($existing.Count)"
foreach ($e in $existing) {
    $src = $nodes | Where-Object { $_.id -eq $e.source_id }
    Write-Host "    [$($e.type_lien)] '$($src.nom_fr)' type=$($src.type)"
}

# Verifier duree_mois des BAC nodes
Write-Host ""
Write-Host "=== DUREE_MOIS des BAC nodes ==="
foreach ($id in $bacIds) {
    $bac = $nodes | Where-Object { $_.id -eq $id }
    Write-Host "  '$($bac.nom_fr)' duree_mois=$($bac.duree_mois)"
}

# Verifier si les city-specific FILIEREs debloquent des metiers APRES correction
# (verifier que les metiers sont bien cat B et non deja accessibles)
Write-Host ""
Write-Host "=== METIERS DE LA FILIERE GENERIQUE - statut actuel ==="
$genFil = 'e1fb9eb0-11a8-48a8-8db4-798c189438a5'
$recrutEdges = $edges | Where-Object { $_.source_id -eq $genFil -and $_.type_lien -eq 'RECRUTEMENT' }
foreach ($e in $recrutEdges) {
    $metier = $nodes | Where-Object { $_.id -eq $e.target_id }
    # Verifier si ce metier est accessible via une autre filiere
    $autresRecrutEdges = $edges | Where-Object { $_.target_id -eq $metier.id -and $_.source_id -ne $genFil -and $_.type_lien -eq 'RECRUTEMENT' }
    $autresSources = $autresRecrutEdges | ForEach-Object {
        $src = $nodes | Where-Object { $_.id -eq $_.source_id }
        # Verifier si cette source est accessible
        $srcIncoming = $edges | Where-Object { $_.target_id -eq $src.id }
        $srcIncoming.Count
    }
    $totalAutres = ($autresRecrutEdges | Measure-Object).Count
    Write-Host "  METIER: '$($metier.nom_fr)' | Autres RECRUTEMENT entrants: $totalAutres"
}
