package sgpo.services;

import sgpo.dtos.CheminDTO;
import sgpo.enums.TypeAcces;
import sgpo.exceptions.GrapheException;

import java.util.List;

public interface GrapheService {
    List<CheminDTO> trouverTousLesChemins(String codeDepart, String codeArrivee,
                                          Double moyenne, String mobilite,
                                          String villeDepart, Integer dureeMax, Double coutMax, TypeAcces typeAccesFiltre) throws GrapheException;
}
