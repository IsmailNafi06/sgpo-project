package sgpo.services;

import sgpo.dtos.CheminDTO;
import sgpo.exceptions.ShareException;

public interface ShareService {
    String createShareLink(CheminDTO chemin) throws ShareException;
    CheminDTO getSharedPath(String token) throws ShareException;
}
